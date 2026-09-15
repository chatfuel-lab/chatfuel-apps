/**
 * The routes, as the module calls them.
 *
 * The browser never talks to the database or to Chatfuel here. It calls routes
 * the proxy serves under its own prefix; the proxy checks the session against
 * the same gate every other request goes through, and only then reads or
 * writes. So this file has no credentials in it and no table names — only the
 * eight paths and the shapes they answer with (`types.ts`).
 */
import type {
  Bucket,
  MessagesPage,
  ConversationRow,
  SeriesResponse,
  StatusResponse,
  Summary,
  SyncMode,
  SyncResponse,
  SyncState,
  Window,
} from './types';

/** Mounted by the proxy under its own prefix; `proxyFetch` supplies the prefix. */
const ROOT = '/inbox-analytics';

export type ProxyFetch = (path: string, init?: RequestInit) => Promise<Response>;

export interface InboxApi {
  /** 'unmounted' when the deployment does not serve the routes (see `probe`). */
  probe(): Promise<'mounted' | 'unmounted'>;
  status(): Promise<StatusResponse>;
  sync(mode: SyncMode): Promise<SyncResponse>;
  cancel(): Promise<SyncState>;
  series(window: Window, bucket: Bucket): Promise<SeriesResponse>;
  summary(window: Window): Promise<Summary>;
  conversations(window: Window): Promise<ConversationRow[]>;
  messagesPage(window: Window, after: string | null, limit?: number): Promise<MessagesPage>;
  purge(): Promise<{ messages: number; conversations: number }>;
}

/** The platform's own words out of an error body, or the status line. */
function errorMessageIn(text: string, response: Response): string {
  try {
    const body = JSON.parse(text) as { errors?: Array<{ message?: string }> };
    if (body.errors?.[0]?.message) return body.errors[0].message;
  } catch {
    /* not an envelope; the status line says more than a page of HTML would */
  }
  return `${response.status} ${response.statusText}`.trim();
}

/** Is a route refusing because a sync holds the claim? Read off the envelope's code. */
export function isSyncBusy(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'SyncBusy';
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

async function json<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let code: string | null = null;
    try {
      const body = JSON.parse(text) as { errors?: Array<{ extensions?: { code?: string } }> };
      code = body.errors?.[0]?.extensions?.code ?? null;
    } catch {
      /* not an envelope */
    }
    throw new ApiError(errorMessageIn(text, response), response.status, code);
  }
  return JSON.parse(text) as T;
}

export function createInboxApi(proxyFetch: ProxyFetch, botId: string): InboxApi {
  const url = (path: string, params: Record<string, string | null | undefined> = {}): string => {
    const query = new URLSearchParams({ botID: botId });
    for (const [key, value] of Object.entries(params)) if (value != null && value !== '') query.set(key, value);
    return `${ROOT}${path}?${query.toString()}`;
  };
  const windowParams = (window: Window) => ({ from: window.from, to: window.to, tz: window.tz });
  const body = (value: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });

  return {
    /*
     * "Mounted" only for a response that IS a status. Not "anything but a 404":
     * a host that does not serve these routes does not reliably say 404 — a
     * single-page app's catch-all answers an unclaimed address with the app's
     * own HTML and a 200 on it. Parsing that as a status fails, and that
     * failure means "not mounted", not "broken". What IS a fault is a route
     * that answers and answers badly — a 500, a refusal — and that is thrown.
     */
    async probe() {
      let response: Response;
      try {
        response = await proxyFetch(url('/status'), { method: 'GET' });
      } catch {
        return 'unmounted';
      }
      if (response.status === 404) return 'unmounted';
      const text = await response.text();
      if (!response.ok) throw new ApiError(errorMessageIn(text, response), response.status, null);
      try {
        const parsed = JSON.parse(text) as { sync?: unknown };
        return parsed && typeof parsed === 'object' && parsed.sync && typeof parsed.sync === 'object'
          ? 'mounted'
          : 'unmounted';
      } catch {
        return 'unmounted';
      }
    },

    async status() {
      return json<StatusResponse>(await proxyFetch(url('/status'), { method: 'GET' }));
    },

    async sync(mode) {
      return json<SyncResponse>(await proxyFetch(url('/sync'), body({ mode })));
    },

    async cancel() {
      const data = await json<{ sync: SyncState }>(await proxyFetch(url('/sync/cancel'), { method: 'POST' }));
      return data.sync;
    },

    async series(window, bucket) {
      return json<SeriesResponse>(
        await proxyFetch(url('/series', { ...windowParams(window), bucket }), { method: 'GET' }),
      );
    },

    async summary(window) {
      const data = await json<{ summary: Summary }>(
        await proxyFetch(url('/summary', windowParams(window)), { method: 'GET' }),
      );
      return data.summary;
    },

    async conversations(window) {
      const data = await json<{ conversations: ConversationRow[] }>(
        await proxyFetch(url('/conversations', { from: window.from, to: window.to }), { method: 'GET' }),
      );
      return data.conversations;
    },

    async messagesPage(window, after, limit = 1000) {
      return json<MessagesPage>(
        await proxyFetch(url('/messages', { from: window.from, to: window.to, after, limit: String(limit) }), {
          method: 'GET',
        }),
      );
    },

    async purge() {
      const data = await json<{ purged: { messages: number; conversations: number } }>(
        await proxyFetch(url('/data'), { method: 'DELETE' }),
      );
      return data.purged;
    },
  };
}
