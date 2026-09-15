import { StatTile } from '~ui';
import { COPY } from '../copy';
import { formatAverage, formatCount, formatDurationMs, formatPercent } from '../lib/format';
import type { Summary } from '../types';

export interface SummaryTilesProps {
  summary: Summary;
  coverage: string;
  stale: boolean;
}

/**
 * The figures, as tiles ("the number is the chart"). Every tile carries the
 * coverage line: a median over a window a reader cannot see is untrustworthy.
 * A null rate arrives as `—`, never `0%`.
 */
export function SummaryTiles({ summary, coverage, stale }: SummaryTilesProps) {
  const perConversation =
    summary.activeConversations > 0 ? (summary.in + summary.out) / summary.activeConversations : null;
  const automationShare = summary.out > 0 ? summary.outboundBySender.automation / summary.out : null;
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
      <StatTile
        label={COPY.tiles.total}
        value={formatCount(summary.in + summary.out)}
        detail={`${formatCount(summary.in)} ${COPY.tiles.inbound.toLowerCase()} · ${formatCount(summary.out)} ${COPY.tiles.outbound.toLowerCase()}`}
        coverage={coverage}
        stale={stale}
      />
      <StatTile
        label={COPY.tiles.conversations}
        value={formatCount(summary.activeConversations)}
        detail={`${formatCount(summary.newConversations)} new · ${COPY.tiles.firstEver}`}
        coverage={coverage}
        stale={stale}
      />
      <StatTile
        label={COPY.tiles.perConversation}
        value={formatAverage(perConversation)}
        coverage={coverage}
        stale={stale}
      />
      <StatTile
        label={COPY.tiles.firstResponse}
        value={formatDurationMs(summary.medianFirstResponseMs)}
        detail={summary.firstResponseSample > 0 ? COPY.tiles.sample(summary.firstResponseSample) : COPY.tiles.noReplies}
        coverage={coverage}
        stale={stale}
      />
      <StatTile
        label={COPY.tiles.response}
        value={formatDurationMs(summary.medianResponseMs)}
        detail={summary.responseSample > 0 ? COPY.tiles.sample(summary.responseSample) : COPY.tiles.noReplies}
        coverage={coverage}
        stale={stale}
      />
      <StatTile
        label={COPY.tiles.automationShare}
        value={formatPercent(automationShare)}
        detail={COPY.tiles.ofOutbound}
        coverage={coverage}
        stale={stale}
      />
    </div>
  );
}
