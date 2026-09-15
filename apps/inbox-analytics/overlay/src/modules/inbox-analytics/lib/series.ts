/**
 * The chart's arithmetic, kept out of the component so a test can ask it:
 * where a point lands, which ticks the axes carry, and the two paths.
 *
 * One y-scale for both series (dataviz: never a dual axis), starting at zero
 * — a count chart that does not start at zero exaggerates every bump. Ticks
 * are "nice" numbers (1, 2, 5 × 10ⁿ) so the axis reads 0 / 500 / 1,000 and
 * not 0 / 437 / 874.
 */
import type { Bucket, SeriesPoint } from '../types';
import { bucketLabel, parseWall } from './format';

export interface Layout {
  width: number;
  height: number;
  /** Plot-area insets: room for the y labels on the left, x labels below. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SeriesGeometry {
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  xOf: (index: number) => number;
  yOf: (value: number) => number;
  yTicks: number[];
  /** Point indexes that carry an x label, and the label. */
  xTicks: { index: number; label: string }[];
  inPath: string;
  outPath: string;
  max: number;
}

/** A round ceiling for the axis: the smallest 1/2/5 × 10ⁿ step whose ≤ 5 multiples cover `max`. */
export function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

/**
 * Which points get an x label: about `want` of them, evenly spaced, always
 * including the first — and for the small buckets, preferring the points that
 * start a day so the label can say the day rather than a clock time twice.
 */
export function xTickIndexes(points: readonly SeriesPoint[], bucket: Bucket, want = 6): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n <= want) return points.map((_, i) => i);
  const step = Math.ceil(n / want);
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  void bucket;
  return out;
}

/** Whether two consecutive labelled points fall on different days (so the label carries the day). */
function daysDiffer(points: readonly SeriesPoint[], indexes: readonly number[]): boolean {
  const days = new Set(indexes.map((i) => points[i]!.t.slice(0, 10)));
  return days.size > 1;
}

export function layoutSeries(points: readonly SeriesPoint[], bucket: Bucket, layout: Layout): SeriesGeometry {
  const plotLeft = layout.left;
  const plotRight = layout.width - layout.right;
  const plotTop = layout.top;
  const plotBottom = layout.height - layout.bottom;
  const max = points.reduce((m, p) => Math.max(m, p.in, p.out), 0);
  const yTicks = niceTicks(max);
  const yMax = yTicks[yTicks.length - 1]!;
  const n = points.length;
  const xOf = (index: number): number =>
    n <= 1 ? (plotLeft + plotRight) / 2 : plotLeft + ((plotRight - plotLeft) * index) / (n - 1);
  const yOf = (value: number): number => plotBottom - ((plotBottom - plotTop) * value) / (yMax || 1);
  const path = (pick: (p: SeriesPoint) => number): string =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(pick(p)).toFixed(1)}`).join(' ');
  const indexes = xTickIndexes(points, bucket);
  const withDay = (bucket === 'minute' || bucket === 'hour') && daysDiffer(points, indexes);
  const xTicks = indexes.map((index) => ({ index, label: bucketLabel(points[index]!.t, bucket, { withDay }) }));
  return {
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    xOf,
    yOf,
    yTicks,
    xTicks,
    inPath: path((p) => p.in),
    outPath: path((p) => p.out),
    max,
  };
}

/** The point nearest an x pixel — the crosshair finds the X, not the mark. */
export function nearestIndex(
  x: number,
  geometry: Pick<SeriesGeometry, 'plotLeft' | 'plotRight'>,
  count: number,
): number {
  if (count <= 1) return 0;
  const span = geometry.plotRight - geometry.plotLeft;
  const ratio = span <= 0 ? 0 : (x - geometry.plotLeft) / span;
  return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
}

/** Weekday index (0 = Sunday) of a wall-clock day, for the table's day-of-week column if wanted. */
export function weekdayOfWall(t: string): number {
  const w = parseWall(t);
  return new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
}

/** The peaks of a 24- or 7-slot histogram: every slot at the maximum, none when everything is zero. */
export function peaks(counts: readonly number[]): number[] {
  const max = Math.max(0, ...counts);
  if (max === 0) return [];
  return counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
}

/** Bar width as a share of the largest slot, 0..1 (0 when everything is 0). */
export function shareOfMax(value: number, counts: readonly number[]): number {
  const max = Math.max(0, ...counts);
  return max === 0 ? 0 : Math.min(1, value / max);
}

/**
 * The hours worth drawing: business hours always, widened to cover any hour
 * with traffic plus one of margin either side. A bot busy at 02:00 shows it;
 * a bot quiet at night does not spend a third of the card on zeros.
 */
export function trimHours(counts: readonly number[]): number[] {
  const busy = counts.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
  let first = 8;
  let last = 17;
  if (busy.length > 0) {
    first = Math.min(first, Math.max(0, Math.min(...busy) - 1));
    last = Math.max(last, Math.min(23, Math.max(...busy) + 1));
  }
  const out: number[] = [];
  for (let h = first; h <= last; h += 1) out.push(h);
  return out;
}
