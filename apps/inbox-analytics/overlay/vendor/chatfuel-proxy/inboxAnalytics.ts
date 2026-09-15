/**
 * Inbox Analytics — the server half of the app.
 *   GET    <inboxAnalyticsPath>/status?botID=          → { sync, stored }
 *   POST   <inboxAnalyticsPath>/sync?botID=            → one bounded chunk of the crawl
 *   POST   <inboxAnalyticsPath>/sync/cancel?botID=     → { sync }
 *   GET    <inboxAnalyticsPath>/series?botID=&from&to&bucket&tz
 *   GET    <inboxAnalyticsPath>/summary?botID=&from&to&tz
 *   GET    <inboxAnalyticsPath>/conversations?botID=&from&to
 *   GET    <inboxAnalyticsPath>/messages?botID=&from&to&after&limit
 *   DELETE <inboxAnalyticsPath>/data?botID=            → { purged }
 *
 * WHY ANY OF THIS EXISTS. Chatfuel has no export and no message analytics:
 * the only way to read a conversation is page by page, newest first, one
 * contact at a time, and nothing aggregates. So the deployment keeps the
 * history itself — the cf_ia_* tables on its own database — and this file is
 * what fills and reads them. Everything below needs two things the browser
 * must never hold: the Chatfuel token (to read the inbox) and the service-role
 * key (to write the tables), which is exactly why it is here and not there.
 *
 * The routes are mounted on the same condition as the publish queue (the gate
 * on, and a service-role key to reach the database with). When they are not
 * mounted the dispatcher does not claim the path at all, the host answers 404,
 * and the app shows its setup screen. That 404 is a contract, not an accident.
 *
 * THE CRAWL IS CHUNKED. One POST /sync does a bounded amount of work — at most
 * CHUNK_MAX_REQUESTS upstream calls or CHUNK_MAX_MS, whichever comes first —
 * persists where it got to, releases the claim and answers. The browser calls
 * again until `exhausted` is true. That keeps every chunk well inside a
 * serverless function's ceiling, and a closed tab simply pauses the run where
 * it stood: the next press of Sync picks it up from the stored bookmark.
 *
 * Direction is decided here, from `sender.__typename`, because nothing else in
 * the schema says it uniformly (the web widget's message types carry no
 * In/Out prefix). See `classifyMessage`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GATE_MESSAGES } from './gate.js';
import { FENCE_UNAVAILABLE_MESSAGE } from './workspaceFence.js';
import {
  JSON_BODY_MAX_BYTES,
  readJsonBodyCapped,
  refuseOversizedBody,
  searchOf,
  send405,
  sendJson,
  sendSyntheticEnvelope,
} from './envelope.js';
import { admitRequest, botAllowed, botBlockedMessage, fenceFor, type Admission } from './admission.js';
import { upstreamGraphql } from './upstream.js';
import { rpcAsService, rpcRefusal } from './supabaseRpc.js';
import type { ProxyContext } from './context.js';

/** Where the routes live unless the config says otherwise. */
export const INBOX_ANALYTICS_PATH_DEFAULT = '/chatfuel/inbox-analytics';

/** Upstream calls one chunk may make before it hands back to the browser. */
const CHUNK_MAX_REQUESTS = 40;
/** Wall-clock budget of one chunk. Well under a serverless ceiling, even a 60 s one. */
const CHUNK_MAX_MS = 45_000;
/** Contacts per chat-list page (`first` is required there). */
const CONTACT_PAGE = 100;
/** Messages per conversation page. */
const MESSAGE_PAGE = 100;
/** Conversations taken from the queue per pass. */
const CONVERSATIONS_PER_PASS = 5;
/** Floor between two upstream calls — about the bulk-throttle preset's 5 rps. */
const REQUEST_SPACING_MS = 200;
/** Rows per upsert: the RPC has ten seconds, and a page is at most 100 anyway. */
const UPSERT_BATCH = 500;
/** Most messages one export page may carry. */
const EXPORT_PAGE_MAX = 1000;

const BUCKETS = new Set(['minute', 'hour', 'day', 'week', 'month']);

// ---------------------------------------------------------------------------
// Chatfuel documents
// ---------------------------------------------------------------------------

/**
 * The slim message shape a sweep needs: identity, time, who spoke, and the
 * text where a type carries one. Deliberately not the inbox's full fragment —
 * that one selects every payload of every platform for a bubble nobody draws
 * here. A type absent from this list stores `text = null` and the transcript
 * prints its type instead, which is honest rather than silently lossy.
 */
export const SLIM_MESSAGE_FRAGMENT = `
fragment IaMessage on Message {
  __typename
  id
  clientId
  sentTime
  sender { __typename name }
  ... on FacebookInTextMessage { text }
  ... on FacebookInPostCommentMessage { text }
  ... on FacebookInAudioMessage { transcribedText }
  ... on FacebookOutTextMessage { text }
  ... on FacebookOutPublicCommentReplyMessage { text }
  ... on InstagramInTextMessage { text }
  ... on InstagramInFeedCommentMessage { text }
  ... on InstagramInReelCommentMessage { text }
  ... on InstagramInAdCommentMessage { text }
  ... on InstagramInStoryReplyMessage { text }
  ... on InstagramInAudioMessage { transcribedText }
  ... on InstagramOutTextMessage { text }
  ... on InstagramOutPublicCommentReplyMessage { text }
  ... on TikTokInTextMessage { text }
  ... on TikTokInTextPostCommentMessage { text }
  ... on TikTokOutTextMessage { text }
  ... on TikTokOutPublicCommentReplyMessage { text }
  ... on WhatsAppInTextMessage { text }
  ... on WhatsAppInImageMessage { caption }
  ... on WhatsAppInVideoMessage { caption }
  ... on WhatsAppInDocumentMessage { caption fileName }
  ... on WhatsAppInAudioMessage { transcribedText }
  ... on WhatsAppInContinueFlowButtonClickMessage { buttonTitle }
  ... on WhatsAppInTemplateQuickReplyButtonClickMessage { buttonTitle }
  ... on WhatsAppInListRowClickMessage { rowTitle }
  ... on WhatsAppOutTextMessage { text }
  ... on WhatsAppOutTextAndURLMessage { bodyText }
  ... on WhatsAppOutTextAndButtonsMessage { bodyText }
  ... on WhatsAppOutListMessage { bodyText }
  ... on WebWidgetTextMessage { text }
  ... on WebWidgetTextAndButtonsMessage { text }
  ... on SystemConversationSummaryMessage { summary }
}`;

/* `__typename` on Contact and Conversation is required — without it fields
   come back missing (the livechat guide's own warning). `first` is required
   on the chat list; the list is sorted by lastConversationMessageTime desc. */
const CHAT_LIST_QUERY = `
query IaChatList($botID: BotID!, $first: Int!, $after: ContactSearchCursor) {
  bot(id: $botID) {
    id
    contactChatsConnection(
      first: $first
      after: $after
      assigneeFilter: { type: Any }
      unreadOnly: false
      salesStageV2Filter: []
    ) {
      edges {
        node {
          __typename
          id
          name
          lastConversationMessageTime
          conversation { __typename id platform }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

/* conversationID IS the contact id. No cursor => newest first; `after:
   pageInfo.endCursor` walks backwards into history. */
const MESSAGES_QUERY = `
query IaMessages($botID: BotID!, $conversationID: ConversationID!, $first: Int, $after: MessagesCursor) {
  bot(id: $botID) {
    id
    conversation(conversationID: $conversationID) {
      __typename
      id
      platform
      messages(first: $first, after: $after) {
        edges { node { ...IaMessage } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
${SLIM_MESSAGE_FRAGMENT}`;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type Direction = 'in' | 'out' | 'system';
export type SenderType = 'contact' | 'admin' | 'automation' | 'app' | 'system';

/** One message as the tables keep it. */
export interface StoredMessageRow {
  key: string;
  conversationId: string;
  platform: string;
  sentAt: string;
  direction: Direction;
  senderType: SenderType;
  senderName: string | null;
  messageType: string;
  text: string | null;
}

interface ContactRow {
  id: string;
  platform: string;
  name: string;
  lastMessageAt: string | null;
  /** True when there is nothing to read: no conversation, or no message ever. */
  empty: boolean;
}

interface SyncState {
  phase: 'idle' | 'contacts' | 'messages' | 'done' | 'cancelled' | 'failed';
  mode: 'continue' | 'restart';
  watermark: string | null;
  contactsCursor: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  contactsSeen: number;
  conversationsQueued: number;
  conversationsDone: number;
  messagesUpserted: number;
  requestsMade: number;
  error: string | null;
  running: boolean;
}

interface QueuedConversation {
  id: string;
  platform: string;
  name: string;
  lastMessageAt: string | null;
  scanState: 'pending' | 'scanning' | 'done';
  scanCursor: string | null;
  scannedUntil: string | null;
}

interface ChunkStats {
  requests: number;
  messagesUpserted: number;
  conversationsDone: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported so a test can ask them directly)
// ---------------------------------------------------------------------------

const PLATFORM_OF_CONTACT: Readonly<Record<string, string>> = {
  WhatsappContact: 'whatsapp',
  InstagramContact: 'instagram',
  FacebookContact: 'facebook',
  TikTokContact: 'tiktok',
  WidgetContact: 'widget',
};

const asString = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/**
 * Who spoke, and which way the message went.
 *
 * The rule, in order of authority:
 * - a `System*` message is the platform talking about the conversation,
 *   whatever its sender says: `system`, excluded from every count. The typing
 *   indicator is a transient and not a message at all — dropped.
 * - the contact spoke: `in`.
 * - an operator, the automation, or the business's own app on the platform
 *   spoke: `out`.
 * Anything else (a sender type this file has not met) is refused rather than
 * guessed: a row filed under the wrong direction is a wrong chart.
 */
export function classifyMessage(node: unknown): Omit<StoredMessageRow, 'conversationId' | 'platform'> | null {
  if (!node || typeof node !== 'object') return null;
  const message = node as Record<string, unknown>;
  const typename = asString(message.__typename);
  const key = asString(message.clientId) ?? asString(message.id);
  const sentAt = asString(message.sentTime);
  if (!typename || !key || !sentAt || Number.isNaN(Date.parse(sentAt))) return null;
  if (typename === 'SystemTypingMessage') return null;

  const sender =
    message.sender && typeof message.sender === 'object' ? (message.sender as Record<string, unknown>) : {};
  const senderTypename = asString(sender.__typename) ?? '';
  const senderName = asString(sender.name);

  let direction: Direction;
  let senderType: SenderType;
  if (typename.startsWith('System')) {
    direction = 'system';
    senderType = 'system';
  } else if (senderTypename === 'ContactMessageSender') {
    direction = 'in';
    senderType = 'contact';
  } else if (senderTypename === 'AdminMessageSender') {
    direction = 'out';
    senderType = 'admin';
  } else if (senderTypename === 'AutomationMessageSender') {
    direction = 'out';
    senderType = 'automation';
  } else if (senderTypename.endsWith('AppSender')) {
    direction = 'out';
    senderType = 'app';
  } else {
    return null;
  }

  const text =
    asString(message.text) ??
    asString(message.caption) ??
    asString(message.transcribedText) ??
    asString(message.bodyText) ??
    asString(message.buttonTitle) ??
    asString(message.rowTitle) ??
    asString(message.summary) ??
    asString(message.fileName);

  return { key, sentAt, direction, senderType, senderName, messageType: typename, text };
}

/** A chat-list node as a conversation row. Null when it names no contact. */
export function contactRowOf(node: unknown): ContactRow | null {
  if (!node || typeof node !== 'object') return null;
  const contact = node as Record<string, unknown>;
  const id = asString(contact.id);
  if (!id) return null;
  const conversation =
    contact.conversation && typeof contact.conversation === 'object'
      ? (contact.conversation as Record<string, unknown>)
      : null;
  const lastMessageAt = asString(contact.lastConversationMessageTime);
  const platform =
    asString(conversation?.platform) ?? PLATFORM_OF_CONTACT[asString(contact.__typename) ?? ''] ?? 'unknown';
  return {
    id,
    platform,
    name: asString(contact.name) ?? '',
    lastMessageAt,
    empty: conversation === null || lastMessageAt === null,
  };
}

/** The export's page cursor, opaque to the browser. */
export function encodeCursor(next: { conversationId: string; sentAt: string; key: string }): string {
  return Buffer.from(JSON.stringify(next), 'utf8').toString('base64url');
}

export function decodeCursor(
  value: string | null,
): { conversationId: string; sentAt: string; key: string } | null | 'bad' {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    const conversationId = asString(parsed.conversationId);
    const sentAt = asString(parsed.sentAt);
    const key = asString(parsed.key);
    if (!conversationId || !sentAt || !key) return 'bad';
    return { conversationId, sentAt, key };
  } catch {
    return 'bad';
  }
}

/** An instant off the query string, or null when it is not one. */
export function parseInstant(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** A zone the runtime knows. The database checks again against its own list. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

const routeRoot = (ctx: ProxyContext): string =>
  (ctx.config as { inboxAnalyticsPath?: string }).inboxAnalyticsPath ?? INBOX_ANALYTICS_PATH_DEFAULT;

type RpcAnswer = { ok: true; payload: unknown } | { ok: false; status: number; code: string; message: string };

const RPC_UNAVAILABLE: RpcAnswer = {
  ok: false,
  status: 503,
  code: 'ProxyAuthUnavailable',
  message: 'The database did not answer',
};

/** One cf_ia_* call, its answer parsed, its refusal named. Never throws. */
async function callRpc(ctx: ProxyContext, name: string, body: unknown): Promise<RpcAnswer> {
  let response: Response;
  try {
    response = await rpcAsService(ctx, name, body);
  } catch {
    return RPC_UNAVAILABLE;
  }
  if (response.status !== 200) {
    const refusal = await rpcRefusal(response, 'InboxAnalyticsRefused');
    return refusal ?? RPC_UNAVAILABLE;
  }
  try {
    return { ok: true, payload: await response.json() };
  } catch {
    return RPC_UNAVAILABLE;
  }
}

function sendRpcFailure(res: ServerResponse, answer: Extract<RpcAnswer, { ok: false }>): void {
  sendSyntheticEnvelope(res, answer.status, answer.message, answer.code);
}

/** The bot the request names, once the fence agrees. The publish queue's own check, verbatim. */
async function botOf(
  ctx: ProxyContext,
  req: IncomingMessage,
  res: ServerResponse,
  admission: Admission,
): Promise<string | undefined> {
  const botId = new URLSearchParams(searchOf(req).slice(1)).get('botID')?.trim();
  if (!botId) {
    sendSyntheticEnvelope(res, 400, 'A botID is required', 'InvalidRequest');
    return undefined;
  }
  const lookup = await fenceFor(ctx, admission);
  if (!lookup.ok) {
    sendSyntheticEnvelope(res, 503, FENCE_UNAVAILABLE_MESSAGE, 'ProxyFenceUnavailable');
    return undefined;
  }
  if (!botAllowed(botId, lookup.ids)) {
    if (admission.botIds?.size === 0) {
      sendSyntheticEnvelope(res, 403, GATE_MESSAGES.AuthTenantForbidden, 'AuthTenantForbidden');
      return undefined;
    }
    sendSyntheticEnvelope(res, 403, botBlockedMessage(botId, Boolean(admission.botIds)), 'BotNotAllowed');
    return undefined;
  }
  return botId;
}

/** A window off the query string, or a 400 already written. */
function windowOf(
  req: IncomingMessage,
  res: ServerResponse,
): { from: string; to: string; query: URLSearchParams } | null {
  const query = new URLSearchParams(searchOf(req).slice(1));
  const from = parseInstant(query.get('from'));
  const to = parseInstant(query.get('to'));
  if (!from || !to || from >= to) {
    sendSyntheticEnvelope(res, 400, 'from and to must be instants, from before to', 'InvalidRequest');
    return null;
  }
  return { from, to, query };
}

function zoneOf(query: URLSearchParams, res: ServerResponse): string | null {
  const tz = query.get('tz')?.trim() || 'UTC';
  if (!isTimeZone(tz)) {
    sendSyntheticEnvelope(res, 400, `${tz} is not a time zone`, 'InvalidRequest');
    return null;
  }
  return tz;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One GraphQL call to Chatfuel with the master token. A GraphQL-level error is
 * thrown with its first message, so the crawl's catch can say what Chatfuel
 * said; a stale cursor is the one error the caller looks for by text.
 */
async function chatfuel(
  ctx: ProxyContext,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const payload = (await upstreamGraphql(ctx, query, variables, ctx.config.timeoutMs)) as {
    data?: Record<string, unknown> | null;
    errors?: Array<{ message?: string; extensions?: { code?: string } }>;
  } | null;
  const first = payload?.errors?.[0];
  if (first) {
    const code = first.extensions?.code;
    throw new Error(`Chatfuel: ${first.message ?? 'unknown error'}${code ? ` (${code})` : ''}`);
  }
  if (!payload?.data) throw new Error('Chatfuel answered without data');
  return payload.data;
}

const isInvalidCursor = (err: unknown): boolean => err instanceof Error && /cursor/i.test(err.message);

// ---------------------------------------------------------------------------
// The crawl
// ---------------------------------------------------------------------------

class ChunkBudget {
  requests = 0;
  private readonly startedAt = Date.now();
  private lastRequestAt = 0;

  exhausted(): boolean {
    return this.requests >= CHUNK_MAX_REQUESTS || Date.now() - this.startedAt >= CHUNK_MAX_MS;
  }

  /** Space upstream calls out; count one. */
  async take(): Promise<void> {
    const wait = this.lastRequestAt + REQUEST_SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
    this.requests += 1;
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }
}

/** Thrown inside the crawl when a progress write reports the run was cancelled. */
class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

/** Thrown when a progress write finds a newer run owns the row: this chunk stops and writes nothing more. */
class SupersededError extends Error {
  constructor() {
    super('superseded');
  }
}

/** Thrown when the database refused a write mid-crawl: the run fails with the database's words. */
class RpcError extends Error {
  constructor(readonly answer: Extract<RpcAnswer, { ok: false }>) {
    super(answer.message);
  }
}

async function rpcOrThrow(ctx: ProxyContext, name: string, body: unknown): Promise<unknown> {
  const answer = await callRpc(ctx, name, body);
  if (!answer.ok) throw new RpcError(answer);
  return answer.payload;
}

/**
 * One progress write. Every patch names the run it belongs to (`runStartedAt`,
 * the claim's own `startedAt`, passed back verbatim so microseconds survive),
 * and the database answers `superseded` when that run is no longer the row's.
 */
async function progress(
  ctx: ProxyContext,
  botId: string,
  run: SyncState,
  patch: Record<string, unknown>,
): Promise<SyncState> {
  const state = (await rpcOrThrow(ctx, 'cf_ia_sync_progress', {
    p_bot_id: botId,
    p_patch: { ...patch, runStartedAt: run.startedAt },
  })) as SyncState & { superseded?: boolean };
  if (state.superseded) throw new SupersededError();
  if (state.phase === 'cancelled') throw new CancelledError();
  return state;
}

/**
 * Phase one: walk the chat list newest-first and queue every contact whose
 * last message is newer than the watermark. The list is sorted by that time,
 * so the first page made entirely of older contacts ends the walk.
 */
async function crawlContacts(
  ctx: ProxyContext,
  botId: string,
  state: SyncState,
  budget: ChunkBudget,
): Promise<{ state: SyncState; finished: boolean }> {
  let cursor: string | null = state.contactsCursor;
  let current = state;
  const watermark = state.watermark ? Date.parse(state.watermark) : null;

  while (!budget.exhausted()) {
    await budget.take();
    const data = await chatfuel(ctx, CHAT_LIST_QUERY, {
      botID: botId,
      first: CONTACT_PAGE,
      after: cursor ?? undefined,
    });
    const bot = data.bot as Record<string, unknown> | undefined;
    const connection = bot?.contactChatsConnection as
      | { edges?: Array<{ node?: unknown } | null>; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } }
      | undefined;
    const nodes = (connection?.edges ?? []).map((edge) => edge?.node);
    const rows = nodes.map(contactRowOf).filter((row): row is ContactRow => row !== null);

    let allOld = rows.length > 0 && watermark !== null;
    if (watermark !== null) {
      for (const row of rows) {
        if (row.lastMessageAt && Date.parse(row.lastMessageAt) > watermark) {
          allOld = false;
          break;
        }
      }
    }
    // Contacts already read to the end are still upserted so their name and
    // platform stay fresh; `empty` keeps a contact with no messages out of the queue.
    const toWrite =
      watermark === null
        ? rows
        : rows.map((row) => ({
            ...row,
            empty: row.empty || (row.lastMessageAt !== null && Date.parse(row.lastMessageAt) <= watermark),
          }));
    const upsert = (await rpcOrThrow(ctx, 'cf_ia_conversations_upsert', { p_bot_id: botId, p_rows: toWrite })) as {
      queued?: number;
    };

    const hasNext = Boolean(connection?.pageInfo?.hasNextPage) && Boolean(connection?.pageInfo?.endCursor);
    const finished = !hasNext || allOld || rows.length === 0;
    cursor = finished ? null : (connection?.pageInfo?.endCursor ?? null);
    current = await progress(ctx, botId, state, {
      phase: finished ? 'messages' : 'contacts',
      contactsCursor: cursor,
      contactsSeen: rows.length,
      conversationsQueued: upsert.queued ?? 0,
      requestsMade: 1,
    });
    if (finished) return { state: current, finished: true };
  }
  return { state: current, finished: false };
}

/**
 * Phase two: read each queued conversation newest-first until its history
 * ends, or reaches the watermark, whichever comes first. Every page is stored
 * before the bookmark moves, so a chunk that dies mid-conversation re-reads
 * one page and nothing more.
 */
async function crawlMessages(
  ctx: ProxyContext,
  botId: string,
  state: SyncState,
  budget: ChunkBudget,
  stats: ChunkStats,
): Promise<{ state: SyncState; finished: boolean }> {
  let current = state;
  const watermark = state.watermark ? Date.parse(state.watermark) : null;

  while (!budget.exhausted()) {
    const queue = (await rpcOrThrow(ctx, 'cf_ia_conversations_next', {
      p_bot_id: botId,
      p_limit: CONVERSATIONS_PER_PASS,
    })) as QueuedConversation[];
    if (queue.length === 0) return { state: current, finished: true };

    for (const conversation of queue) {
      let cursor: string | null = conversation.scanCursor;
      let retriedCursor = false;
      for (;;) {
        if (budget.exhausted()) return { state: current, finished: false };
        await budget.take();
        let data: Record<string, unknown>;
        try {
          data = await chatfuel(ctx, MESSAGES_QUERY, {
            botID: botId,
            conversationID: conversation.id,
            first: MESSAGE_PAGE,
            after: cursor ?? undefined,
          });
        } catch (err) {
          // A stale bookmark: start this conversation over, once (pagination.md).
          if (cursor && isInvalidCursor(err) && !retriedCursor) {
            retriedCursor = true;
            cursor = null;
            continue;
          }
          throw err;
        }
        const bot = data.bot as Record<string, unknown> | undefined;
        const conv = bot?.conversation as Record<string, unknown> | undefined;
        const platform = asString(conv?.platform) ?? conversation.platform;
        const page = conv?.messages as
          | {
              edges?: Array<{ node?: unknown } | null>;
              pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            }
          | undefined;
        const nodes = (page?.edges ?? []).map((edge) => edge?.node);

        const rows: StoredMessageRow[] = [];
        let oldest: number | null = null;
        for (const node of nodes) {
          const classified = classifyMessage(node);
          if (!classified) continue;
          const ms = Date.parse(classified.sentAt);
          if (oldest === null || ms < oldest) oldest = ms;
          rows.push({ ...classified, conversationId: conversation.id, platform });
        }
        for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
          await rpcOrThrow(ctx, 'cf_ia_messages_upsert', { p_bot_id: botId, p_rows: rows.slice(i, i + UPSERT_BATCH) });
        }
        stats.messagesUpserted += rows.length;

        const hasNext = Boolean(page?.pageInfo?.hasNextPage) && Boolean(page?.pageInfo?.endCursor);
        const reachedWatermark = watermark !== null && oldest !== null && oldest <= watermark;
        const done = !hasNext || reachedWatermark || nodes.length === 0;
        cursor = done ? null : (page?.pageInfo?.endCursor ?? null);
        await rpcOrThrow(ctx, 'cf_ia_conversation_scan', {
          p_bot_id: botId,
          p_id: conversation.id,
          p_state: done ? 'done' : 'scanning',
          p_cursor: cursor,
          p_until: oldest === null ? null : new Date(oldest).toISOString(),
        });
        if (done) stats.conversationsDone += 1;
        current = await progress(ctx, botId, state, {
          phase: 'messages',
          messagesUpserted: rows.length,
          conversationsDone: done ? 1 : 0,
          requestsMade: 1,
        });
        if (done) break;
      }
    }
  }
  return { state: current, finished: false };
}

/** One chunk of the crawl, from claim to hand-back. */
async function runChunk(
  ctx: ProxyContext,
  botId: string,
  mode: 'continue' | 'restart',
): Promise<{ sync: SyncState; chunk: unknown } | RpcAnswer> {
  const claim = await callRpc(ctx, 'cf_ia_sync_claim', { p_bot_id: botId, p_mode: mode });
  if (!claim.ok) return claim;
  let state = claim.payload as SyncState;
  const budget = new ChunkBudget();
  const stats: ChunkStats = { requests: 0, messagesUpserted: 0, conversationsDone: 0 };

  const answer = (sync: SyncState, exhausted: boolean) => ({
    sync,
    chunk: {
      requests: budget.requests,
      messagesUpserted: stats.messagesUpserted,
      conversationsDone: stats.conversationsDone,
      elapsedMs: budget.elapsedMs(),
      exhausted,
    },
  });

  try {
    if (state.phase === 'contacts') {
      const contacts = await crawlContacts(ctx, botId, state, budget);
      state = contacts.state;
      if (!contacts.finished) {
        state = await progress(ctx, botId, state, { release: true });
        return answer(state, false);
      }
    }
    if (state.phase === 'messages') {
      const messages = await crawlMessages(ctx, botId, state, budget, stats);
      state = messages.state;
      if (!messages.finished) {
        state = await progress(ctx, botId, state, { release: true });
        return answer(state, false);
      }
    }
    const finished = (await rpcOrThrow(ctx, 'cf_ia_sync_finish', { p_bot_id: botId, p_phase: 'done' })) as SyncState;
    return answer(finished, true);
  } catch (err) {
    if (err instanceof SupersededError) {
      // Another run owns the row now; report this chunk as over and leave the row alone.
      return answer({ ...state, running: false }, true);
    }
    if (err instanceof CancelledError) {
      const cancelled = await callRpc(ctx, 'cf_ia_sync_finish', { p_bot_id: botId, p_phase: 'cancelled' });
      return answer(cancelled.ok ? (cancelled.payload as SyncState) : state, true);
    }
    // The message is the crawl's own or Chatfuel's first error line — never a
    // token, never a body. The database's refusal keeps its own words.
    const message =
      err instanceof RpcError ? `Database: ${err.message}` : err instanceof Error ? err.message : 'The sync failed';
    const failed = await callRpc(ctx, 'cf_ia_sync_finish', { p_bot_id: botId, p_phase: 'failed', p_error: message });
    return answer(
      failed.ok ? (failed.payload as SyncState) : { ...state, phase: 'failed', error: message, running: false },
      true,
    );
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handleStatus(ctx: ProxyContext, res: ServerResponse, botId: string): Promise<void> {
  const [sync, stored] = await Promise.all([
    callRpc(ctx, 'cf_ia_sync_get', { p_bot_id: botId }),
    callRpc(ctx, 'cf_ia_stored', { p_bot_id: botId }),
  ]);
  if (!sync.ok) return sendRpcFailure(res, sync);
  if (!stored.ok) return sendRpcFailure(res, stored);
  sendJson(res, 200, { sync: sync.payload, stored: stored.payload });
}

async function handleSync(ctx: ProxyContext, req: IncomingMessage, res: ServerResponse, botId: string): Promise<void> {
  const read = await readJsonBodyCapped(req, JSON_BODY_MAX_BYTES);
  if (read.tooLarge) return refuseOversizedBody(req, res);
  const body = read.value && typeof read.value === 'object' ? (read.value as { mode?: unknown }) : {};
  const mode =
    body.mode === 'restart' ? 'restart' : body.mode === 'continue' || body.mode === undefined ? 'continue' : null;
  if (mode === null) {
    sendSyntheticEnvelope(res, 400, 'mode must be "continue" or "restart"', 'InvalidRequest');
    return;
  }
  const result = await runChunk(ctx, botId, mode);
  if ('ok' in result) {
    if (!result.ok) return sendRpcFailure(res, result);
    return;
  }
  sendJson(res, 200, result);
}

async function handleCancel(ctx: ProxyContext, res: ServerResponse, botId: string): Promise<void> {
  const answer = await callRpc(ctx, 'cf_ia_sync_cancel', { p_bot_id: botId });
  if (!answer.ok) return sendRpcFailure(res, answer);
  sendJson(res, 200, { sync: answer.payload });
}

async function handleSeries(
  ctx: ProxyContext,
  req: IncomingMessage,
  res: ServerResponse,
  botId: string,
): Promise<void> {
  const window = windowOf(req, res);
  if (!window) return;
  const tz = zoneOf(window.query, res);
  if (!tz) return;
  const bucket = window.query.get('bucket') ?? 'day';
  if (!BUCKETS.has(bucket)) {
    sendSyntheticEnvelope(res, 400, `${bucket} is not a bucket size`, 'InvalidRequest');
    return;
  }
  const answer = await callRpc(ctx, 'cf_ia_series', {
    p_bot_id: botId,
    p_from: window.from,
    p_to: window.to,
    p_bucket: bucket,
    p_tz: tz,
  });
  if (!answer.ok) return sendRpcFailure(res, answer);
  const payload = answer.payload as { points?: unknown; total?: unknown };
  sendJson(res, 200, {
    bucket,
    tz,
    from: window.from,
    to: window.to,
    points: payload.points ?? [],
    total: payload.total ?? { in: 0, out: 0 },
  });
}

async function handleSummary(
  ctx: ProxyContext,
  req: IncomingMessage,
  res: ServerResponse,
  botId: string,
): Promise<void> {
  const window = windowOf(req, res);
  if (!window) return;
  const tz = zoneOf(window.query, res);
  if (!tz) return;
  const answer = await callRpc(ctx, 'cf_ia_summary', {
    p_bot_id: botId,
    p_from: window.from,
    p_to: window.to,
    p_tz: tz,
  });
  if (!answer.ok) return sendRpcFailure(res, answer);
  sendJson(res, 200, { summary: answer.payload });
}

async function handleConversations(
  ctx: ProxyContext,
  req: IncomingMessage,
  res: ServerResponse,
  botId: string,
): Promise<void> {
  const window = windowOf(req, res);
  if (!window) return;
  const answer = await callRpc(ctx, 'cf_ia_conversations_list', {
    p_bot_id: botId,
    p_from: window.from,
    p_to: window.to,
  });
  if (!answer.ok) return sendRpcFailure(res, answer);
  sendJson(res, 200, { conversations: answer.payload });
}

async function handleMessages(
  ctx: ProxyContext,
  req: IncomingMessage,
  res: ServerResponse,
  botId: string,
): Promise<void> {
  const window = windowOf(req, res);
  if (!window) return;
  const after = decodeCursor(window.query.get('after'));
  if (after === 'bad') {
    sendSyntheticEnvelope(res, 400, 'That page cursor is not one this route issued', 'InvalidRequest');
    return;
  }
  const limitRaw = Number.parseInt(window.query.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(EXPORT_PAGE_MAX, limitRaw)) : EXPORT_PAGE_MAX;
  const answer = await callRpc(ctx, 'cf_ia_messages_page', {
    p_bot_id: botId,
    p_from: window.from,
    p_to: window.to,
    p_after_conversation: after?.conversationId ?? null,
    p_after_sent: after?.sentAt ?? null,
    p_after_key: after?.key ?? null,
    p_limit: limit,
  });
  if (!answer.ok) return sendRpcFailure(res, answer);
  const payload = answer.payload as {
    messages?: unknown;
    next?: { conversationId: string; sentAt: string; key: string } | null;
  };
  sendJson(res, 200, { messages: payload.messages ?? [], next: payload.next ? encodeCursor(payload.next) : null });
}

async function handlePurge(ctx: ProxyContext, res: ServerResponse, botId: string): Promise<void> {
  const answer = await callRpc(ctx, 'cf_ia_purge', { p_bot_id: botId });
  if (!answer.ok) return sendRpcFailure(res, answer);
  sendJson(res, 200, { purged: answer.payload });
}

/**
 * The dispatcher core.ts hands every `<inboxAnalyticsPath>/*` request to.
 * Admission first (the gate, the token, the tenant limit), then the bot the
 * request names against the fence, then the route.
 */
export async function handleInboxAnalytics(
  ctx: ProxyContext,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  const root = routeRoot(ctx);
  const rest = pathname === root ? '' : pathname.startsWith(`${root}/`) ? pathname.slice(root.length) : null;
  const method = (req.method ?? 'GET').toUpperCase();

  const expected: Record<string, string> = {
    '/status': 'GET',
    '/sync': 'POST',
    '/sync/cancel': 'POST',
    '/series': 'GET',
    '/summary': 'GET',
    '/conversations': 'GET',
    '/messages': 'GET',
    '/data': 'DELETE',
  };
  if (rest === null || !Object.hasOwn(expected, rest)) {
    sendSyntheticEnvelope(res, 404, 'No such route', 'NotFound');
    return;
  }
  if (method !== expected[rest]) {
    send405(res, expected[rest]);
    return;
  }

  const admission = await admitRequest(ctx, req, res);
  if (!admission) return;
  const botId = await botOf(ctx, req, res, admission);
  if (botId === undefined) return;

  switch (rest) {
    case '/status':
      return handleStatus(ctx, res, botId);
    case '/sync':
      return handleSync(ctx, req, res, botId);
    case '/sync/cancel':
      return handleCancel(ctx, res, botId);
    case '/series':
      return handleSeries(ctx, req, res, botId);
    case '/summary':
      return handleSummary(ctx, req, res, botId);
    case '/conversations':
      return handleConversations(ctx, req, res, botId);
    case '/messages':
      return handleMessages(ctx, req, res, botId);
    case '/data':
      return handlePurge(ctx, res, botId);
    default:
      sendSyntheticEnvelope(res, 404, 'No such route', 'NotFound');
  }
}
