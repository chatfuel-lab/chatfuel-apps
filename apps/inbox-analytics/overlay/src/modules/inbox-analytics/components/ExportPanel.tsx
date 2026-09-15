import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, IconDownload, PageBody, Progress, useToast } from '~ui';
import type { InboxApi } from '../api';
import { COPY } from '../copy';
import { downloadBlob } from '../lib/download';
import { coverageLine, dayKeyForName, formatCount } from '../lib/format';
import { buildExportZip } from '../lib/zip';
import type { ConversationRow, StoredMessage, Window } from '../types';

export interface ExportPanelProps {
  api: InboxApi;
  window: Window;
  /** `in + out + system` in the window, when the overview has it; the panel counts otherwise. */
  expectedMessages: number | null;
}

/** Above this the zip is still built, and the panel says it is a lot. */
const LARGE_EXPORT = 200_000;

/**
 * The export: the window's conversations, paged out of the routes a thousand
 * messages at a time, zipped in the browser, handed over as a file. Nothing
 * starts on mount but the count; the download is a button.
 */
export function ExportPanel({ api, window, expectedMessages }: ExportPanelProps) {
  const toast = useToast();
  const [conversations, setConversations] = useState<ConversationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'fetching' | 'building'>('idle');
  const cancelled = useRef(false);

  const total = conversations ? conversations.reduce((n, c) => n + c.messageCount, 0) : (expectedMessages ?? 0);

  useEffect(() => {
    let alive = true;
    setConversations(null);
    setError(null);
    api
      .conversations(window)
      .then((rows) => alive && setConversations(rows))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, [api, window]);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const download = useCallback(async () => {
    if (!conversations) return;
    cancelled.current = false;
    setError(null);
    setFetched(0);
    setPhase('fetching');
    try {
      const messages: StoredMessage[] = [];
      let after: string | null = null;
      do {
        const page = await api.messagesPage(window, after, 1000);
        messages.push(...page.messages);
        after = page.next;
        setFetched(messages.length);
        if (cancelled.current) return;
      } while (after);
      setPhase('building');
      /* Let the progress bar paint before the synchronous zip takes the thread. */
      await new Promise((resolve) => setTimeout(resolve, 30));
      const { bytes, counts } = buildExportZip({
        window,
        conversations,
        messages,
        generatedAt: new Date().toISOString(),
      });
      downloadBlob(
        COPY.export.fileName(dayKeyForName(window.from, window.tz), dayKeyForName(window.to, window.tz)),
        bytes,
        'application/zip',
      );
      toast.show({ title: COPY.export.toastDone(counts.conversations), tone: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.show({ title: COPY.export.toastFailed, description: message, tone: 'danger' });
    } finally {
      setPhase('idle');
    }
  }, [api, conversations, toast, window]);

  const busy = phase !== 'idle';
  const empty = conversations !== null && conversations.length === 0;

  return (
    <PageBody>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Card
          title={COPY.export.title}
          description={COPY.export.description}
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={download}
              disabled={!conversations || empty || busy}
              loading={busy}
            >
              <IconDownload />
              {COPY.export.download}
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text">{conversations ? COPY.export.counts(conversations.length, total) : '…'}</p>
            <p className="text-micro text-text-faint">{coverageLine(total, window.from, window.to, window.tz)}</p>
            {empty ? <Alert tone="info">{COPY.export.nothing}</Alert> : null}
            {total > LARGE_EXPORT ? <Alert tone="warning">{COPY.export.largeWarning(total)}</Alert> : null}
            {error ? (
              <Alert tone="danger" title={COPY.empty.error}>
                {error}
              </Alert>
            ) : null}
            {busy ? (
              <Progress
                label={COPY.export.progressLabel}
                value={phase === 'fetching' ? fetched : undefined}
                max={Math.max(total, fetched, 1)}
                showLabel
              />
            ) : null}
            {busy ? (
              <p className="text-xs text-text-muted">
                {phase === 'fetching' ? COPY.export.fetching(fetched, total) : COPY.export.building}
              </p>
            ) : null}
          </div>
        </Card>

        <Card title="What is in the zip">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text-muted">
            {COPY.export.contents.map((line) => (
              <li key={line}>
                <code className="text-xs text-text">{line.split(' — ')[0]}</code>
                {line.includes(' — ') ? ` — ${line.split(' — ').slice(1).join(' — ')}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-micro text-text-faint">{COPY.export.mediaNote}</p>
          {conversations ? (
            <p className="mt-1 text-micro text-text-faint">
              {formatCount(conversations.length)} conversations in this window
            </p>
          ) : null}
        </Card>
      </div>
    </PageBody>
  );
}
