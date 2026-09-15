/**
 * Numbers and instants as the page prints them. Pure.
 *
 * A null rate prints as `—`, never `0%`: a window with no replies has no
 * response time, and a zero would claim an instant one.
 */
import { formatInZone } from '~ui';
import { COPY } from '../copy';
import type { Bucket } from '../types';

export const formatCount = (n: number, locale?: string): string => n.toLocaleString(locale);

/** `12%`; null → `—`. Whole percents: these are shares of a few hundred messages. */
export function formatPercent(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

/** `1.4` for a per-conversation average; null → `—`. */
export function formatAverage(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return value >= 10 ? Math.round(value).toLocaleString() : value.toFixed(1);
}

/** `45 s` · `4 min` · `1 h 12 min` · `1 d 3 h`; null → `—`. */
export function formatDurationMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes === 0 ? `${hours} h` : `${hours} h ${restMinutes} min`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days} d` : `${days} d ${restHours} h`;
}

/** `Sep 10, 14:05` in the zone. */
export function formatInstant(iso: string | null, tz: string, locale?: string): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return formatInZone(ms, tz, { locale, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** `Sep 10, 2026, 14:05:33` — the transcript's stamp. */
export function formatStamp(iso: string, tz: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return formatInZone(ms, tz, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** `Aug 1 – 31` · `Aug 1 – Sep 15` · `Sep 15, 2025 – Sep 15, 2026`. */
export function rangeLabel(fromIso: string, toIso: string, tz: string, locale?: string): string {
  const from = Date.parse(fromIso);
  /* `to` is exclusive; the label names the last instant inside the window. */
  const to = Date.parse(toIso) - 1;
  if (Number.isNaN(from) || Number.isNaN(to)) return '';
  const sameYear =
    formatInZone(from, tz, { locale, year: 'numeric' }) === formatInZone(to, tz, { locale, year: 'numeric' });
  const sameMonth =
    sameYear && formatInZone(from, tz, { locale, month: 'short' }) === formatInZone(to, tz, { locale, month: 'short' });
  const thisYear =
    formatInZone(to, tz, { locale, year: 'numeric' }) === formatInZone(Date.now(), tz, { locale, year: 'numeric' });
  if (sameMonth) {
    const month = formatInZone(from, tz, { locale, month: 'short' });
    const a = formatInZone(from, tz, { locale, day: 'numeric' });
    const b = formatInZone(to, tz, { locale, day: 'numeric' });
    const year = thisYear ? '' : `, ${formatInZone(to, tz, { locale, year: 'numeric' })}`;
    return a === b ? `${month} ${a}${year}` : `${month} ${a} – ${b}${year}`;
  }
  const options: Intl.DateTimeFormatOptions =
    sameYear && thisYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' };
  return `${formatInZone(from, tz, { locale, ...options })} – ${formatInZone(to, tz, { locale, ...options })}`;
}

/** `over 12,430 messages · Aug 1 – 31 · Europe/Berlin`. */
export function coverageLine(messages: number, fromIso: string, toIso: string, tz: string): string {
  return COPY.coverage.line(messages, rangeLabel(fromIso, toIso, tz), tz);
}

/** The pieces of a wall-clock bucket start (`YYYY-MM-DDTHH:mm:ss`, no zone). */
export function parseWall(t: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t);
  if (!m) return { year: 0, month: 1, day: 1, hour: 0, minute: 0 };
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: Number(m[4]), minute: Number(m[5]) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * A bucket's label at the size it was cut in. Wall-clock input, so no zone
 * arithmetic here — the database already cut the buckets in the zone.
 */
export function bucketLabel(t: string, bucket: Bucket, options: { withDay?: boolean } = {}): string {
  const w = parseWall(t);
  const day = `${MONTHS[w.month - 1]} ${w.day}`;
  switch (bucket) {
    case 'minute':
    case 'hour': {
      const clock = `${pad2(w.hour)}:${pad2(w.minute)}`;
      return options.withDay ? `${day}, ${clock}` : clock;
    }
    case 'day':
    case 'week':
      return day;
    case 'month':
      return `${MONTHS[w.month - 1]} ${w.year}`;
    default:
      return t;
  }
}

/** The full label a tooltip or a table row wants: day and clock for the small buckets. */
export function bucketFullLabel(t: string, bucket: Bucket): string {
  const w = parseWall(t);
  switch (bucket) {
    case 'minute':
    case 'hour':
      return `${MONTHS[w.month - 1]} ${w.day}, ${pad2(w.hour)}:${pad2(w.minute)}`;
    case 'week':
      return `Week of ${MONTHS[w.month - 1]} ${w.day}, ${w.year}`;
    case 'day':
      return `${MONTHS[w.month - 1]} ${w.day}, ${w.year}`;
    case 'month':
      return `${MONTHS[w.month - 1]} ${w.year}`;
    default:
      return t;
  }
}

/** `14:00` for the busiest-hours card. */
export const hourLabel = (hour: number): string => `${pad2(hour)}:00`;

/** A file-name-safe day, `2026-09-15`, out of an instant in the zone. */
export function dayKeyForName(iso: string, tz: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'unknown';
  return formatInZone(ms, tz, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\D+/g, '-')
    .replace(/^-|-$/g, '');
}
