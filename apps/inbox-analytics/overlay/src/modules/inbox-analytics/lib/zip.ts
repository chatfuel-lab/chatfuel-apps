/**
 * The export archive, assembled in the browser from pages the routes served.
 *
 *   conversations/<platform>-<contact id>.json   every stored message
 *   conversations/<platform>-<contact id>.txt    the same as a transcript
 *   contacts.csv                                  one row per conversation
 *   manifest.json                                 the window, the counts, when
 *
 * `fflate` builds the zip synchronously in memory: at a few hundred bytes a
 * message, a hundred thousand messages is tens of megabytes, which a browser
 * holds fine. The panel warns above that and still proceeds — narrowing the
 * window is the operator's call, not this file's.
 */
import { strToU8, zipSync } from 'fflate';
import { CSV_BOM, csvText } from '~ui';
import { APP_VERSION, COPY } from '../copy';
import type { ConversationRow, StoredMessage, Window } from '../types';
import { transcriptText } from './transcript';

export interface ExportInput {
  window: Window;
  conversations: readonly ConversationRow[];
  messages: readonly StoredMessage[];
  generatedAt: string;
}

export interface ExportCounts {
  conversations: number;
  messages: number;
  in: number;
  out: number;
  system: number;
}

/* Path separators, the punctuation Windows refuses, and control characters.
   Contact ids are platform ids and mostly digits, but an id is off the wire. */
// eslint-disable-next-line no-control-regex -- control characters are the very thing this strips
const UNSAFE = /[\u0000-\u001f\u007f/\\:*?"<>|]/g;

export function entryName(platform: string, id: string): string {
  const safe = `${platform}-${id}`
    .replace(UNSAFE, '-')
    .replace(/^[.\s]+/, '')
    .slice(0, 120);
  return safe === '' ? 'conversation' : safe;
}

/** Messages by conversation, oldest first inside each. */
export function groupByConversation(messages: readonly StoredMessage[]): Map<string, StoredMessage[]> {
  const groups = new Map<string, StoredMessage[]>();
  for (const message of messages) {
    const list = groups.get(message.conversationId);
    if (list) list.push(message);
    else groups.set(message.conversationId, [message]);
  }
  for (const list of groups.values())
    list.sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.key.localeCompare(b.key));
  return groups;
}

export function countMessages(messages: readonly StoredMessage[]): Omit<ExportCounts, 'conversations'> {
  let inbound = 0;
  let outbound = 0;
  let system = 0;
  for (const m of messages) {
    if (m.direction === 'in') inbound += 1;
    else if (m.direction === 'out') outbound += 1;
    else system += 1;
  }
  return { messages: inbound + outbound + system, in: inbound, out: outbound, system };
}

export function contactsCsv(conversations: readonly ConversationRow[]): string {
  const rows: (string | number | null)[][] = [[...COPY.csv.columns]];
  for (const c of conversations)
    rows.push([c.id, c.platform, c.name, c.messageCount, c.firstMessageAt, c.lastMessageAt]);
  return CSV_BOM + csvText(rows);
}

export function manifestJson(input: ExportInput, counts: ExportCounts): string {
  return JSON.stringify(
    {
      app: 'inbox-analytics',
      appVersion: APP_VERSION,
      generatedAt: input.generatedAt,
      window: { from: input.window.from, to: input.window.to, tz: input.window.tz },
      counts,
      files: {
        conversations: 'conversations/<platform>-<contact id>.json and .txt',
        contacts: 'contacts.csv',
      },
    },
    null,
    2,
  );
}

/** The archive's bytes. Pure apart from the clock the caller passes in. */
export function buildExportZip(input: ExportInput): { bytes: Uint8Array; counts: ExportCounts } {
  const groups = groupByConversation(input.messages);
  const byId = new Map(input.conversations.map((c) => [c.id, c]));
  const entries: Record<string, Uint8Array> = {};
  const used = new Set<string>();

  for (const [conversationId, messages] of groups) {
    const row = byId.get(conversationId);
    const contact = {
      id: conversationId,
      platform: row?.platform ?? messages[0]?.platform ?? 'unknown',
      name: row?.name ?? '',
    };
    let base = entryName(contact.platform, contact.id);
    /* Two ids that sanitise to the same name would overwrite each other in the archive. */
    let suffix = 1;
    while (used.has(base)) base = `${entryName(contact.platform, contact.id)}-${(suffix += 1)}`;
    used.add(base);
    entries[`conversations/${base}.json`] = strToU8(
      JSON.stringify({ contact, timeZone: input.window.tz, messages }, null, 2),
    );
    entries[`conversations/${base}.txt`] = strToU8(transcriptText(messages, contact, input.window.tz));
  }

  const counts: ExportCounts = { conversations: groups.size, ...countMessages(input.messages) };
  entries['contacts.csv'] = strToU8(contactsCsv(input.conversations.filter((c) => groups.has(c.id))));
  entries['manifest.json'] = strToU8(manifestJson(input, counts));

  const bytes = zipSync(entries, { level: 6 });
  return { bytes, counts };
}
