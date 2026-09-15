import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  EmptyState,
  IconChat,
  IconRefresh,
  ModuleRoot,
  PageBody,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Tag,
  ToastProvider,
  localTimeZone,
  useToast,
} from '~ui';
import { BotChannelsDocument } from '~api/generated/core/graphql';
import type { ModuleAppProps } from '../types';
import { createInboxApi, isSyncBusy, type InboxApi } from './api';
import { BreakdownCards } from './components/BreakdownCards';
import { ExportPanel } from './components/ExportPanel';
import { NoChannelsState } from './components/NoChannelsState';
import { RangeToolbar } from './components/RangeToolbar';
import { SetupState } from './components/SetupState';
import { SummaryTiles } from './components/SummaryTiles';
import { SyncCard } from './components/SyncCard';
import { TimeSeriesChart } from './components/TimeSeriesChart';
import { COPY, type RangePreset } from './copy';
import { coverageLine, formatInstant, rangeLabel } from './lib/format';
import { allowedBuckets, isPreset, pickBucket, resolveWindow } from './lib/range';
import type { Bucket, SeriesResponse, StatusResponse, Summary, SyncMode } from './types';

/**
 * Embeddable root of the Inbox Analytics module: the sync that fills the
 * deployment's own message tables, the overview computed from them, and the
 * export that zips them.
 *
 * This component owns the providers and nothing else; `Workspace` reads them
 * (a context hook called inside the component that renders the provider
 * throws at runtime, and neither `tsc` nor a node-only test can see it).
 */
export function InboxAnalyticsApp(props: ModuleAppProps) {
  return (
    <ToastProvider>
      <ModuleRoot className="relative flex h-full flex-col">
        <Workspace {...props} />
      </ModuleRoot>
    </ToastProvider>
  );
}

type Mounted = 'probing' | 'mounted' | 'unmounted';
type View = '' | 'export';

function Workspace({ botId, client, params, setParams, view, setView, navigate }: ModuleAppProps) {
  const toast = useToast();
  const api = useMemo<InboxApi | null>(
    () => (client.proxyFetch ? createInboxApi(client.proxyFetch, botId) : null),
    [client, botId],
  );

  // ---- is the server half there, and is anything connected? ----
  const [mounted, setMounted] = useState<Mounted>('probing');
  const [probeError, setProbeError] = useState<string | null>(null);
  const [channels, setChannels] = useState<number | null>(null);

  const probe = useCallback(async () => {
    if (!api) {
      setMounted('unmounted');
      return;
    }
    setMounted('probing');
    setProbeError(null);
    try {
      setMounted(await api.probe());
    } catch (err) {
      setMounted('unmounted');
      setProbeError(err instanceof Error ? err.message : String(err));
    }
  }, [api]);

  useEffect(() => {
    void probe();
  }, [probe]);

  useEffect(() => {
    let alive = true;
    client
      .query(BotChannelsDocument, { botID: botId })
      .then((data) => alive && setChannels(data.bot.contactScopes.length))
      .catch(() => alive && setChannels(null));
    return () => {
      alive = false;
    };
  }, [client, botId]);

  // ---- the window, from the address ----
  const tz = params.get('tz') && params.get('tz') !== '' ? params.get('tz')! : localTimeZone();
  const presetParam = params.get('range');
  const preset: RangePreset = isPreset(presetParam) ? presetParam : '30d';
  const window = useMemo(
    () => resolveWindow(preset, { from: params.get('from'), to: params.get('to') }, tz),
    // The window is re-resolved when the address changes, not every render:
    // `to` is "now" for the presets, and a chart that re-fetches on every tick
    // is a chart that never settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset, params.get('from'), params.get('to'), tz],
  );
  const spanMs = Date.parse(window.to) - Date.parse(window.from);
  const buckets = useMemo(() => allowedBuckets(spanMs), [spanMs]);
  const bucket = pickBucket(params.get('bucket'), spanMs);

  const setParam = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      setParams(next);
    },
    [params, setParams],
  );

  // ---- status and the sync loop ----
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const stopRequested = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (!api || mounted !== 'mounted') return;
    try {
      setStatus(await api.status());
    } catch {
      /* the overview says what it can; the next action refreshes again */
    }
  }, [api, mounted]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const [dataToken, setDataToken] = useState(0);

  const runSync = useCallback(
    async (mode: SyncMode) => {
      if (!api || syncing) return;
      setSyncing(true);
      stopRequested.current = false;
      let next: SyncMode = mode;
      try {
        for (;;) {
          const result = await api.sync(next);
          next = 'continue';
          setStatus((current) => (current ? { ...current, sync: result.sync } : current));
          if (result.chunk.exhausted || stopRequested.current) {
            const phase = result.sync.phase;
            if (phase === 'done')
              toast.show({ title: COPY.sync.toastDone(result.sync.messagesUpserted), tone: 'success' });
            else if (phase === 'cancelled') toast.show({ title: COPY.sync.toastCancelled, tone: 'info' });
            else if (phase === 'failed')
              toast.show({ title: COPY.sync.toastFailed, description: result.sync.error ?? undefined, tone: 'danger' });
            break;
          }
        }
      } catch (err) {
        toast.show({
          title: isSyncBusy(err) ? COPY.sync.busy : COPY.sync.toastFailed,
          description: isSyncBusy(err) ? undefined : err instanceof Error ? err.message : String(err),
          tone: 'danger',
        });
      } finally {
        setSyncing(false);
        await refreshStatus();
        setDataToken((n) => n + 1);
      }
    },
    [api, syncing, toast, refreshStatus],
  );

  const cancelSync = useCallback(async () => {
    if (!api) return;
    stopRequested.current = true;
    try {
      const sync = await api.cancel();
      setStatus((current) => (current ? { ...current, sync } : current));
    } catch (err) {
      toast.show({
        title: COPY.sync.toastFailed,
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      });
    }
  }, [api, toast]);

  const purge = useCallback(async () => {
    if (!api) return;
    await api.purge();
    toast.show({ title: COPY.danger.toastPurged, tone: 'info' });
    await refreshStatus();
    setDataToken((n) => n + 1);
  }, [api, toast, refreshStatus]);

  // ---- the overview's data ----
  const [series, setSeries] = useState<SeriesResponse | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasData = (status?.stored.messages ?? 0) > 0;

  useEffect(() => {
    if (!api || mounted !== 'mounted' || !hasData) return undefined;
    let alive = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([api.series(window, bucket), api.summary(window)])
      .then(([s, m]) => {
        if (!alive) return;
        setSeries(s);
        setSummary(m);
      })
      .catch((err: unknown) => alive && setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [api, mounted, hasData, window, bucket, dataToken]);

  // ---- render ----
  const currentView: View = view === 'export' ? 'export' : '';
  const lastSynced = status?.sync.finishedAt ? formatInstant(status.sync.finishedAt, tz) : null;
  const coverage = summary ? coverageLine(summary.in + summary.out, window.from, window.to, window.tz) : null;
  const staleWindow =
    summary?.coverage.storedNewestAt &&
    Date.parse(window.to) > Date.parse(summary.coverage.storedNewestAt) + 60 * 60 * 1000
      ? COPY.coverage.staleWindow(formatInstant(summary.coverage.storedNewestAt, tz))
      : null;

  if (mounted === 'probing') {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton variant="block" height="2rem" width="16rem" />
        <Skeleton variant="block" height="12rem" />
      </div>
    );
  }
  if (mounted === 'unmounted' || !api) {
    return (
      <>
        {probeError ? (
          <div className="p-4">
            <Alert tone="warning" title={COPY.empty.error}>
              {probeError}
            </Alert>
          </div>
        ) : null}
        <SetupState onRetry={() => void probe()} checking={false} />
      </>
    );
  }

  const header = (
    <PageHeader
      title={COPY.title}
      meta={
        <Tag tone={syncing || status?.sync.running ? 'accent' : 'neutral'}>
          {syncing || status?.sync.running
            ? COPY.sync.running
            : lastSynced
              ? `${COPY.sync.lastSynced} ${lastSynced}`
              : COPY.sync.never}
        </Tag>
      }
      actions={
        <>
          <SegmentedControl<View>
            aria-label="View"
            size="sm"
            value={currentView}
            onChange={(next) => setView(next, params)}
            options={[
              { value: '', label: COPY.views.overview },
              { value: 'export', label: COPY.views.export },
            ]}
          />
          {!syncing && !status?.sync.running ? (
            <Button variant="secondary" size="sm" onClick={() => void runSync('continue')}>
              <IconRefresh />
              {COPY.sync.syncNow}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (channels === 0 && !hasData) {
    return (
      <>
        {header}
        <NoChannelsState onConnect={() => navigate('/channels')} />
      </>
    );
  }

  if (currentView === 'export') {
    return (
      <>
        {header}
        {hasData ? (
          <ExportPanel
            api={api}
            window={window}
            expectedMessages={summary ? summary.in + summary.out + summary.system : null}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState icon={<IconChat />} title={COPY.empty.noData} description={COPY.empty.noDataDescription} />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {header}
      <RangeToolbar
        preset={preset}
        onPreset={(next) =>
          setParam({
            range: next,
            from: next === 'custom' ? window.fromDay : null,
            to: next === 'custom' ? window.toDay : null,
          })
        }
        fromDay={window.fromDay}
        toDay={window.toDay}
        onDates={(from, to) => setParam({ range: 'custom', from, to })}
        bucket={bucket}
        buckets={buckets}
        onBucket={(next: Bucket) => setParam({ bucket: next })}
        tz={tz}
        onTz={(next) => setParam({ tz: next })}
        coverage={coverage}
        loading={loading}
      />
      <PageBody>
        <div className="flex flex-col gap-4">
          <SyncCard
            status={status}
            syncing={syncing}
            tz={tz}
            onSync={(mode) => void runSync(mode)}
            onCancel={() => void cancelSync()}
            onPurge={purge}
          />

          {!hasData ? (
            <EmptyState icon={<IconChat />} title={COPY.empty.noData} description={COPY.empty.noDataDescription} />
          ) : loadError ? (
            <Alert
              tone="danger"
              title={COPY.empty.error}
              action={
                <Button variant="secondary" size="xs" onClick={() => setDataToken((n) => n + 1)}>
                  {COPY.empty.retry}
                </Button>
              }
            >
              {loadError}
            </Alert>
          ) : !series || !summary ? (
            <div className="flex flex-col gap-3">
              <Skeleton variant="block" height="18rem" />
              <Skeleton variant="block" height="6rem" />
            </div>
          ) : summary.in + summary.out === 0 ? (
            <EmptyState icon={<IconChat />} title={COPY.empty.noWindow} description={COPY.empty.noWindowDescription} />
          ) : (
            <>
              {staleWindow ? <Alert tone="info">{staleWindow}</Alert> : null}
              <TimeSeriesChart
                points={series.points}
                bucket={series.bucket}
                total={series.total}
                rangeLabel={rangeLabel(window.from, window.to, window.tz)}
                coverage={coverage ?? ''}
                stale={loading}
              />
              <SummaryTiles summary={summary} coverage={coverage ?? ''} stale={loading} />
              <BreakdownCards summary={summary} tz={tz} coverage={coverage ?? ''} stale={loading} />
            </>
          )}
        </div>
      </PageBody>
    </>
  );
}
