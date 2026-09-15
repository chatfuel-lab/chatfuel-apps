import type { ReactNode } from 'react';
import { Card } from '~ui';
import { COPY, SENDER_LABELS, WEEKDAY_LABELS, platformLabel } from '../copy';
import { formatCount, formatInstant, formatPercent, hourLabel } from '../lib/format';
import { peaks, shareOfMax, trimHours } from '../lib/series';
import type { Summary } from '../types';

export interface BreakdownCardsProps {
  summary: Summary;
  tz: string;
  coverage: string;
  stale: boolean;
}

/**
 * The page's bar marks, in one place so the cards read as one chart system.
 *
 * Every list here is ONE series — a count of messages — so every bar wears one
 * hue and identity comes from the label beside it, never from the colour.
 * Two shapes, and the difference is the denominator: `rank` draws against
 * the biggest row in its own list (which hour is busiest), `meter` against a
 * known whole (this sender's share of every outbound message), on a lighter
 * track of the same hue so a half-full meter reads as half-full.
 */
function BarRow({
  label,
  fraction,
  shape = 'rank',
  value,
  detail,
  title,
  muted = false,
  labelWidth = '7rem',
}: {
  label: ReactNode;
  fraction: number;
  shape?: 'rank' | 'meter';
  value: ReactNode;
  detail?: ReactNode;
  title: string;
  muted?: boolean;
  labelWidth?: string;
}) {
  return (
    <li className="flex items-center gap-3 text-xs" title={title}>
      <span
        className={`min-w-0 shrink-0 truncate ${muted ? 'text-text-faint' : 'text-text-muted'}`}
        style={{ width: labelWidth }}
      >
        {label}
      </span>
      <span
        className={`relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full ${shape === 'meter' ? 'bg-event-1-soft' : 'bg-surface-sunken'}`}
        role="img"
        aria-label={title}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-r-full bg-event-1 transition-[width] duration-base ease-standard"
          style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, opacity: muted ? 0.45 : 1 }}
        />
      </span>
      <span className={`w-14 shrink-0 text-right tabular-nums ${muted ? 'text-text-faint' : 'font-medium text-text'}`}>
        {value}
      </span>
      {detail !== undefined ? (
        <span className="w-10 shrink-0 text-right tabular-nums text-text-faint">{detail}</span>
      ) : null}
    </li>
  );
}

function SectionCard({
  title,
  description,
  coverage,
  stale,
  children,
}: {
  title: string;
  description: string;
  coverage: string;
  stale: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      title={title}
      description={description}
      className={`transition-opacity duration-base ease-standard ${stale ? 'opacity-60' : ''}`}
    >
      {children}
      <p className="mt-3 text-micro text-text-faint">{coverage}</p>
    </Card>
  );
}

export function BreakdownCards({ summary, tz, coverage, stale }: BreakdownCardsProps) {
  const platformTotals = summary.byPlatform.map((p) => p.in + p.out);
  const senders = [
    { key: 'automation', count: summary.outboundBySender.automation },
    { key: 'admin', count: summary.outboundBySender.admin },
    { key: 'app', count: summary.outboundBySender.app },
  ] as const;
  const hours = trimHours(summary.byHour);
  const hourPeaks = peaks(summary.byHour);
  const weekdayPeaks = peaks(summary.byWeekday);

  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(20rem,1fr))]">
      <SectionCard
        title={COPY.breakdown.platforms}
        description={COPY.breakdown.platformsDescription}
        coverage={coverage}
        stale={stale}
      >
        {summary.byPlatform.length === 0 ? (
          <p className="text-xs text-text-muted">{COPY.breakdown.noMessages}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.byPlatform.map((p) => {
              const total = p.in + p.out;
              return (
                <BarRow
                  key={p.platform}
                  label={platformLabel(p.platform)}
                  fraction={shareOfMax(total, platformTotals)}
                  value={formatCount(total)}
                  detail={`${formatCount(p.in)}↓ ${formatCount(p.out)}↑`}
                  title={`${platformLabel(p.platform)}: ${formatCount(p.in)} inbound, ${formatCount(p.out)} outbound`}
                />
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={COPY.breakdown.senders}
        description={COPY.breakdown.sendersDescription}
        coverage={coverage}
        stale={stale}
      >
        <ul className="flex flex-col gap-2">
          {senders.map((s) => (
            <BarRow
              key={s.key}
              label={SENDER_LABELS[s.key]}
              shape="meter"
              fraction={summary.out > 0 ? s.count / summary.out : 0}
              value={formatCount(s.count)}
              detail={formatPercent(summary.out > 0 ? s.count / summary.out : null)}
              title={`${SENDER_LABELS[s.key]}: ${formatCount(s.count)} of ${formatCount(summary.out)} outbound messages`}
              muted={s.count === 0}
            />
          ))}
        </ul>
      </SectionCard>

      <SectionCard
        title={COPY.breakdown.hours}
        description={COPY.breakdown.hoursDescription}
        coverage={coverage}
        stale={stale}
      >
        <ul className="flex flex-col gap-1.5">
          {hours.map((hour) => (
            <BarRow
              key={hour}
              label={hourLabel(hour)}
              labelWidth="3.5rem"
              fraction={shareOfMax(summary.byHour[hour] ?? 0, summary.byHour)}
              value={formatCount(summary.byHour[hour] ?? 0)}
              title={`${hourLabel(hour)} in ${tz}: ${formatCount(summary.byHour[hour] ?? 0)} messages`}
              muted={(summary.byHour[hour] ?? 0) === 0}
            />
          ))}
        </ul>
        {hourPeaks.length > 0 ? (
          <p className="mt-2 text-xs text-text-muted">{COPY.breakdown.peak(hourPeaks.map(hourLabel).join(', '))}</p>
        ) : null}
      </SectionCard>

      <SectionCard
        title={COPY.breakdown.weekdays}
        description={COPY.breakdown.weekdaysDescription}
        coverage={coverage}
        stale={stale}
      >
        <ul className="flex flex-col gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <BarRow
              key={day}
              label={WEEKDAY_LABELS[day]}
              fraction={shareOfMax(summary.byWeekday[day] ?? 0, summary.byWeekday)}
              value={formatCount(summary.byWeekday[day] ?? 0)}
              title={`${WEEKDAY_LABELS[day]} in ${tz}: ${formatCount(summary.byWeekday[day] ?? 0)} messages`}
              muted={(summary.byWeekday[day] ?? 0) === 0}
            />
          ))}
        </ul>
        {weekdayPeaks.length > 0 ? (
          <p className="mt-2 text-xs text-text-muted">
            {COPY.breakdown.peak(weekdayPeaks.map((d) => WEEKDAY_LABELS[d] ?? '').join(', '))}
          </p>
        ) : null}
      </SectionCard>

      <Card
        title={COPY.breakdown.top}
        description={COPY.breakdown.topDescription}
        padded={false}
        className={`transition-opacity duration-base ease-standard ${stale ? 'opacity-60' : ''}`}
      >
        {summary.topConversations.length === 0 ? (
          <p className="p-4 text-xs text-text-muted">{COPY.breakdown.noMessages}</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-surface-sunken text-left text-text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{COPY.breakdown.topColumns.name}</th>
                <th className="px-3 py-2 font-medium">{COPY.breakdown.topColumns.platform}</th>
                <th className="px-3 py-2 text-right font-medium">{COPY.breakdown.topColumns.in}</th>
                <th className="px-3 py-2 text-right font-medium">{COPY.breakdown.topColumns.out}</th>
                <th className="px-4 py-2 text-right font-medium">{COPY.breakdown.topColumns.last}</th>
              </tr>
            </thead>
            <tbody>
              {summary.topConversations.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="max-w-[14rem] truncate px-4 py-2 text-text">{c.name || COPY.breakdown.unnamed}</td>
                  <td className="px-3 py-2 text-text-muted">{platformLabel(c.platform)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text">{formatCount(c.in)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text">{formatCount(c.out)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-muted">
                    {formatInstant(c.lastMessageAt, tz)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="px-4 py-3 text-micro text-text-faint">{coverage}</p>
      </Card>
    </div>
  );
}
