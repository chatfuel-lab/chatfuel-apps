/**
 * The wire shapes between this module and its routes
 * (`vendor/chatfuel-proxy/inboxAnalytics.ts`). One definition, mirrored by
 * hand: the server writes plain JSON and this file is what the module trusts
 * it to have written.
 */

export type Direction = 'in' | 'out' | 'system';
export type SenderType = 'contact' | 'admin' | 'automation' | 'app' | 'system';
export type Bucket = 'minute' | 'hour' | 'day' | 'week' | 'month';
export type SyncPhase = 'idle' | 'contacts' | 'messages' | 'done' | 'cancelled' | 'failed';
export type SyncMode = 'continue' | 'restart';

export interface SyncState {
  phase: SyncPhase;
  mode: SyncMode;
  /** The previous completed run's start; everything older is already stored. */
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
  /** A chunk holds the claim right now. */
  running: boolean;
}

export interface StoredCounts {
  messages: number;
  conversations: number;
  oldestAt: string | null;
  newestAt: string | null;
}

export interface StatusResponse {
  sync: SyncState;
  stored: StoredCounts;
}

export interface SyncChunk {
  requests: number;
  messagesUpserted: number;
  conversationsDone: number;
  elapsedMs: number;
  /** True when the run ended (done, failed or cancelled); false means "call again". */
  exhausted: boolean;
}

export interface SyncResponse {
  sync: SyncState;
  chunk: SyncChunk;
}

export interface SeriesPoint {
  /** Wall-clock start of the bucket in the requested zone, `YYYY-MM-DDTHH:mm:ss`, no offset. */
  t: string;
  in: number;
  out: number;
}

export interface SeriesResponse {
  bucket: Bucket;
  tz: string;
  from: string;
  to: string;
  points: SeriesPoint[];
  total: { in: number; out: number };
}

export interface PlatformSplit {
  platform: string;
  in: number;
  out: number;
}

export interface TopConversation {
  id: string;
  platform: string;
  name: string;
  in: number;
  out: number;
  lastMessageAt: string;
}

export interface Summary {
  total: number;
  in: number;
  out: number;
  system: number;
  activeConversations: number;
  newConversations: number;
  outboundBySender: { automation: number; admin: number; app: number };
  medianFirstResponseMs: number | null;
  firstResponseSample: number;
  medianResponseMs: number | null;
  responseSample: number;
  /** 24 counts, hour 0..23 in the zone. */
  byHour: number[];
  /** 7 counts, Sunday first (Postgres' `dow`). */
  byWeekday: number[];
  byPlatform: PlatformSplit[];
  topConversations: TopConversation[];
  coverage: {
    from: string;
    to: string;
    tz: string;
    storedNewestAt: string | null;
    lastSyncFinishedAt: string | null;
  };
}

export interface ConversationRow {
  id: string;
  platform: string;
  name: string;
  messageCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
}

export interface StoredMessage {
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

export interface MessagesPage {
  messages: StoredMessage[];
  /** Opaque; pass back as `after` for the next page. Null on the last page. */
  next: string | null;
}

/** The window every read takes: instants, and the zone buckets are cut in. */
export interface Window {
  from: string;
  to: string;
  tz: string;
}
