/**
 * The window and its buckets — pure, so a test can ask.
 *
 * A window is two instants, cut in a zone: "the last 7 days" starts at
 * midnight six days ago in the operator's zone, not 168 hours ago, because
 * that is what the operator means and what the day buckets will be cut on.
 * `to` is the present for every preset but a custom one, so the chart's last
 * bucket is the one happening now.
 *
 * Buckets are bounded by what a chart can hold and what the series RPC will
 * answer (2000 points): a day of minutes is 1440, a month of hours 744, a
 * year of days 366. Past those the size is not offered.
 */
import { shiftDayKey, wallClockIn, wallClockToInstant, type DayKey } from '~ui';
import type { RangePreset } from '../copy';
import type { Bucket } from '../types';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The most points the chart draws and the series RPC answers. */
export const POINT_CAP = 2000;

export interface ResolvedWindow {
  from: string;
  to: string;
  tz: string;
  preset: RangePreset;
  /** Day keys in the zone, for the custom pickers and the label. */
  fromDay: DayKey;
  toDay: DayKey;
}

const startOfDay = (day: DayKey, tz: string): number => {
  const [year, month, date] = day.split('-').map(Number);
  return wallClockToInstant({ year: year!, month: month!, day: date! }, tz);
};

/**
 * Resolve a preset (or a custom day pair) to instants. A custom pair with a
 * missing or inverted end falls back to the last 30 days, which is the
 * default preset — a window that cannot be drawn is not a window.
 */
export function resolveWindow(
  preset: RangePreset,
  custom: { from: string | null; to: string | null },
  tz: string,
  now: number = Date.now(),
): ResolvedWindow {
  const today = wallClockIn(now, tz).dayKey;
  const fromDayOf = (daysBack: number): DayKey => shiftDayKey(today, -daysBack);
  const window = (fromDay: DayKey, from: number, to: number, toDay: DayKey, kind: RangePreset): ResolvedWindow => ({
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    tz,
    preset: kind,
    fromDay,
    toDay,
  });

  switch (preset) {
    case 'today':
      return window(today, startOfDay(today, tz), now, today, preset);
    case '24h': {
      const from = now - DAY_MS;
      return window(wallClockIn(from, tz).dayKey, from, now, today, preset);
    }
    case '7d': {
      const fromDay = fromDayOf(6);
      return window(fromDay, startOfDay(fromDay, tz), now, today, preset);
    }
    case '30d': {
      const fromDay = fromDayOf(29);
      return window(fromDay, startOfDay(fromDay, tz), now, today, preset);
    }
    case '90d': {
      const fromDay = fromDayOf(89);
      return window(fromDay, startOfDay(fromDay, tz), now, today, preset);
    }
    case '12m': {
      const wall = wallClockIn(now, tz);
      const monthsBack = 11;
      const month = ((((wall.month - 1 - monthsBack) % 12) + 12) % 12) + 1;
      const year = wall.year - (wall.month - 1 - monthsBack < 0 ? 1 : 0);
      const fromDay = `${year}-${String(month).padStart(2, '0')}-01` as DayKey;
      return window(fromDay, startOfDay(fromDay, tz), now, today, preset);
    }
    case 'custom': {
      const fromDay = custom.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) ? (custom.from as DayKey) : null;
      const toDay = custom.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) ? (custom.to as DayKey) : null;
      if (!fromDay || !toDay || fromDay > toDay) return resolveWindow('30d', custom, tz, now);
      const from = startOfDay(fromDay, tz);
      const to = Math.min(startOfDay(shiftDayKey(toDay, 1), tz), now);
      if (to <= from) return window(fromDay, from, from + 60_000, toDay, preset);
      return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), tz, preset, fromDay, toDay };
    }
    default:
      return resolveWindow('30d', custom, tz, now);
  }
}

const BUCKET_ORDER: readonly Bucket[] = ['minute', 'hour', 'day', 'week', 'month'];

/** Which bucket sizes the chart may draw over a span this long. */
export function allowedBuckets(spanMs: number): Bucket[] {
  const days = spanMs / DAY_MS;
  return BUCKET_ORDER.filter((bucket) => {
    switch (bucket) {
      case 'minute':
        return days <= 1.05;
      case 'hour':
        return days <= 31.5;
      case 'day':
        return days <= 366.5;
      default:
        return true;
    }
  });
}

/** The bucket a span reads best in: hours for a day, days for a month, weeks for a year, months beyond. */
export function defaultBucket(spanMs: number): Bucket {
  const days = spanMs / DAY_MS;
  if (days <= 1.05) return 'hour';
  if (days <= 31.5) return 'day';
  if (days <= 366.5) return 'week';
  return 'month';
}

/** The bucket asked for if it is allowed for the span, otherwise the default. */
export function pickBucket(requested: string | null, spanMs: number): Bucket {
  const allowed = allowedBuckets(spanMs);
  if (requested && (allowed as string[]).includes(requested)) return requested as Bucket;
  return defaultBucket(spanMs);
}

export const isPreset = (value: string | null): value is RangePreset =>
  value === 'today' ||
  value === '24h' ||
  value === '7d' ||
  value === '30d' ||
  value === '90d' ||
  value === '12m' ||
  value === 'custom';
