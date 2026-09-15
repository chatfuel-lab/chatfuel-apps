import { useState } from 'react';
import { Alert, Button, Card, ConfirmDialog, IconRefresh, IconStop, IconTrash, Progress, Tag } from '~ui';
import { COPY } from '../copy';
import { formatCount, formatInstant } from '../lib/format';
import type { StatusResponse, SyncMode } from '../types';

export interface SyncCardProps {
  status: StatusResponse | null;
  /** The browser is looping chunks right now. */
  syncing: boolean;
  tz: string;
  onSync: (mode: SyncMode) => void;
  onCancel: () => void;
  onPurge: () => Promise<void>;
}

const PHASE_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  idle: 'neutral',
  contacts: 'accent',
  messages: 'accent',
  done: 'success',
  cancelled: 'warning',
  failed: 'danger',
};

/**
 * The crawl's face: where it is, what it has stored, and the four things an
 * operator can do about it. A sync never starts on its own — the card says so
 * — because reading somebody's whole inbox is a thing to press a button for.
 */
export function SyncCard({ status, syncing, tz, onSync, onCancel, onPurge }: SyncCardProps) {
  const [confirmResync, setConfirmResync] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const sync = status?.sync;
  const stored = status?.stored;
  const phase = sync?.phase ?? 'idle';
  const active = syncing || Boolean(sync?.running);
  const resumable = !active && (phase === 'contacts' || phase === 'messages');
  const inMessages = phase === 'messages' && (sync?.conversationsQueued ?? 0) > 0;

  return (
    <>
      <Card
        title={COPY.sync.title}
        description={stored ? COPY.sync.stored(stored.messages, stored.conversations) : COPY.sync.never}
        actions={
          <div className="flex items-center gap-2">
            <Tag tone={PHASE_TONE[phase] ?? 'neutral'}>{COPY.sync.phase[phase]}</Tag>
            {active ? (
              <Button variant="secondary" size="sm" onClick={onCancel}>
                <IconStop />
                {COPY.sync.cancel}
              </Button>
            ) : (
              <>
                <Button variant="primary" size="sm" onClick={() => onSync('continue')}>
                  <IconRefresh />
                  {resumable ? COPY.sync.continueRun : COPY.sync.syncNow}
                </Button>
                {stored && stored.messages > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmResync(true)}>
                    {COPY.sync.resync}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {active && sync ? (
            <Progress
              label={COPY.sync.progressLabel}
              value={inMessages ? sync.conversationsDone : undefined}
              max={inMessages ? Math.max(sync.conversationsQueued, sync.conversationsDone, 1) : undefined}
              showLabel
            />
          ) : null}
          {sync && (active || phase === 'done' || phase === 'cancelled') ? (
            <p className="text-xs text-text-muted">
              {COPY.sync.counters(sync.conversationsDone, sync.conversationsQueued, sync.messagesUpserted)}
            </p>
          ) : null}
          {phase === 'failed' && sync?.error ? (
            <Alert tone="danger" title={COPY.sync.failedPrefix}>
              {sync.error}
            </Alert>
          ) : null}
          <p className="text-micro text-text-faint">
            {sync?.finishedAt ? `${COPY.sync.lastSynced} ${formatInstant(sync.finishedAt, tz)} · ` : ''}
            {COPY.sync.tabNote}
          </p>
        </div>
      </Card>

      {stored && stored.messages > 0 && !active ? (
        <Card
          tone="danger"
          title={COPY.danger.title}
          description={COPY.danger.description}
          actions={
            <Button variant="dangerGhost" size="sm" onClick={() => setConfirmPurge(true)}>
              <IconTrash />
              {COPY.danger.purge}
            </Button>
          }
        />
      ) : null}

      <ConfirmDialog
        open={confirmResync}
        onClose={() => setConfirmResync(false)}
        title={COPY.sync.resyncTitle}
        confirmLabel={COPY.sync.resyncConfirm}
        onConfirm={() => {
          setConfirmResync(false);
          onSync('restart');
        }}
      >
        <p className="text-sm text-text-muted">{COPY.sync.resyncBody}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmPurge}
        onClose={() => setConfirmPurge(false)}
        title={COPY.danger.purgeTitle}
        confirmLabel={COPY.danger.purgeConfirm}
        tone="danger"
        onConfirm={async () => {
          await onPurge();
          setConfirmPurge(false);
        }}
      >
        <p className="text-sm text-text-muted">
          {COPY.danger.purgeBody}
          {stored ? ` (${formatCount(stored.messages)} messages)` : ''}
        </p>
      </ConfirmDialog>
    </>
  );
}
