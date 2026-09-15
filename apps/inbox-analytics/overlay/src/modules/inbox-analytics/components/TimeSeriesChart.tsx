import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Card, IconColumns, IconLayoutList } from '~ui';
import { COPY, DIRECTION_LABELS } from '../copy';
import { bucketFullLabel, formatCount } from '../lib/format';
import { layoutSeries, nearestIndex } from '../lib/series';
import type { Bucket, SeriesPoint } from '../types';

export interface TimeSeriesChartProps {
  points: readonly SeriesPoint[];
  bucket: Bucket;
  total: { in: number; out: number };
  /** The range in words, for the accessible name. */
  rangeLabel: string;
  /** The coverage sentence under the plot. */
  coverage: string;
  stale: boolean;
}

/* The two series' colours: the calendar's first and fifth event tones, which
   sit far apart on the wheel (ΔE 30 under protan, 37 normal) and follow the
   dark theme through the same tokens. Text never wears them. */
const IN_COLOR = 'var(--color-event-1)';
const OUT_COLOR = 'var(--color-event-5)';

const HEIGHT = 260;
const INSETS = { left: 44, right: 16, top: 12, bottom: 28 };

/** The container's width, followed through resizes; 800 before the first measure. */
function useWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(Math.round(next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Two lines on one zero-based axis: inbound and outbound messages per bucket.
 *
 * Dataviz, applied: 2 px lines, hairline recessive grid, ≤ 6 y ticks on round
 * numbers, a legend in words (identity never colour-alone), a crosshair that
 * finds the X with one tooltip listing both series, an 8 px marker with a
 * surface ring on the hovered point, a coverage sentence, and a table view of
 * the same numbers — the relief the palette's contrast warning obligates.
 */
export function TimeSeriesChart({ points, bucket, total, rangeLabel, coverage, stale }: TimeSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = useWidth(containerRef);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const geometry = useMemo(
    () => layoutSeries(points, bucket, { width, height: HEIGHT, ...INSETS }),
    [points, bucket, width],
  );
  const hovered = hover !== null ? points[hover] : undefined;

  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    setHover(nearestIndex(x, geometry, points.length));
  };

  const label = COPY.chart.ariaLabel(total.in, total.out, rangeLabel);

  return (
    <Card
      title={COPY.chart.title}
      actions={
        <Button variant="ghost" size="xs" onClick={() => setTable((v) => !v)} aria-pressed={table}>
          {table ? <IconColumns /> : <IconLayoutList />}
          {table ? COPY.chart.chartToggle : COPY.chart.tableToggle}
        </Button>
      }
      className={`transition-opacity duration-base ease-standard ${stale ? 'opacity-60' : ''}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <Legend color={IN_COLOR} label={DIRECTION_LABELS.in} value={total.in} />
        <Legend color={OUT_COLOR} label={DIRECTION_LABELS.out} value={total.out} />
      </div>

      {table ? (
        <SeriesTable points={points} bucket={bucket} />
      ) : (
        <div ref={containerRef} className="relative w-full">
          <svg
            role="img"
            aria-label={label}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            width="100%"
            height={HEIGHT}
            className="block select-none text-text-muted"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {/* Gridlines and y labels: hairline, one step off the surface. */}
            {geometry.yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={geometry.plotLeft}
                  x2={geometry.plotRight}
                  y1={geometry.yOf(tick)}
                  y2={geometry.yOf(tick)}
                  stroke="var(--color-border)"
                  strokeWidth={1}
                />
                <text
                  x={geometry.plotLeft - 8}
                  y={geometry.yOf(tick) + 3.5}
                  textAnchor="end"
                  fontSize={10}
                  fill="currentColor"
                  className="tabular-nums"
                >
                  {formatCount(tick)}
                </text>
              </g>
            ))}
            {/* x labels */}
            {geometry.xTicks.map((tick) => (
              <text
                key={tick.index}
                x={geometry.xOf(tick.index)}
                y={HEIGHT - 8}
                textAnchor={tick.index === 0 ? 'start' : tick.index === points.length - 1 ? 'end' : 'middle'}
                fontSize={10}
                fill="currentColor"
              >
                {tick.label}
              </text>
            ))}
            {/* The two series */}
            <path
              d={geometry.inPath}
              fill="none"
              stroke={IN_COLOR}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={geometry.outPath}
              fill="none"
              stroke={OUT_COLOR}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Crosshair and markers on the hovered X */}
            {hover !== null && hovered ? (
              <g>
                <line
                  x1={geometry.xOf(hover)}
                  x2={geometry.xOf(hover)}
                  y1={geometry.plotTop}
                  y2={geometry.plotBottom}
                  stroke="var(--color-border-strong)"
                  strokeWidth={1}
                />
                <circle
                  cx={geometry.xOf(hover)}
                  cy={geometry.yOf(hovered.in)}
                  r={5}
                  fill={IN_COLOR}
                  stroke="var(--color-surface-raised)"
                  strokeWidth={2}
                />
                <circle
                  cx={geometry.xOf(hover)}
                  cy={geometry.yOf(hovered.out)}
                  r={5}
                  fill={OUT_COLOR}
                  stroke="var(--color-surface-raised)"
                  strokeWidth={2}
                />
              </g>
            ) : null}
          </svg>
          {hover !== null && hovered ? (
            <div
              className="pointer-events-none absolute top-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-raised"
              style={{
                left: `${(geometry.xOf(hover) / width) * 100}%`,
                transform: geometry.xOf(hover) > width / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
              }}
            >
              <div className="mb-1 font-medium text-text">{bucketFullLabel(hovered.t, bucket)}</div>
              <TooltipRow color={IN_COLOR} label={DIRECTION_LABELS.in} value={hovered.in} />
              <TooltipRow color={OUT_COLOR} label={DIRECTION_LABELS.out} value={hovered.out} />
            </div>
          ) : null}
        </div>
      )}
      <p className="mt-3 text-micro text-text-faint">{coverage}</p>
    </Card>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      <span>{label}</span>
      <span className="font-medium tabular-nums text-text">{formatCount(value)}</span>
    </span>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="font-semibold tabular-nums text-text">{formatCount(value)}</span>
      <span className="text-text-muted">{label}</span>
    </div>
  );
}

/** The same numbers as rows: every value the chart draws, reachable without a pointer. */
function SeriesTable({ points, bucket }: { points: readonly SeriesPoint[]; bucket: Bucket }) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface-sunken text-left text-text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">{COPY.chart.columns.bucket}</th>
            <th className="px-3 py-2 text-right font-medium">{COPY.chart.columns.in}</th>
            <th className="px-3 py-2 text-right font-medium">{COPY.chart.columns.out}</th>
            <th className="px-3 py-2 text-right font-medium">{COPY.chart.columns.total}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.t} className="border-t border-border">
              <td className="px-3 py-1.5 text-text">{bucketFullLabel(p.t, bucket)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-text">{formatCount(p.in)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-text">{formatCount(p.out)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-text-muted">{formatCount(p.in + p.out)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
