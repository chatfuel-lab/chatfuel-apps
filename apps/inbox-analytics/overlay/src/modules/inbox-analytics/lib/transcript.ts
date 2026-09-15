/**
 * A conversation as a readable transcript — one line per message, in the
 * export's zone:
 *
 *   [2026-09-10 14:05:33] Ann: hi
 *   [2026-09-10 14:05:40] Automation: hello
 *   [2026-09-10 15:00:00] Ann: (WhatsAppInImageMessage)
 *   [2026-09-10 15:00:01] [system] SystemLivechatOpenedManuallyMessage
 *
 * A message without text prints its type in parentheses rather than an empty
 * line: the reader learns that an image was sent, not that nothing was.
 * Multi-line text is indented on continuation lines so a line that starts
 * with `[` is always a new message.
 */
import { COPY, platformLabel } from '../copy';
import type { StoredMessage } from '../types';
import { formatStamp } from './format';

/** Who to print before the colon. The contact's own name for inbound; the sender's, or the role, for outbound. */
export function speakerOf(message: StoredMessage, contactName: string): string {
  if (message.direction === 'in') return contactName || message.senderName || COPY.transcript.contact;
  if (message.direction === 'system') return `[${COPY.transcript.system}]`;
  if (message.senderName) return message.senderName;
  switch (message.senderType) {
    case 'admin':
      return COPY.transcript.operator;
    case 'automation':
      return COPY.transcript.automation;
    case 'app':
      return COPY.transcript.app(message.platform);
    default:
      return message.senderType;
  }
}

/** The stamp the transcript prints: `YYYY-MM-DD HH:mm:ss` in the zone. */
export function transcriptStamp(iso: string, tz: string): string {
  /* `formatStamp` gives `09/10/2026, 14:05:33` or `10.09.2026, 14:05:33` by
     locale; the transcript wants one shape whatever the locale, so the parts
     are reassembled from a fixed en-CA-style read. */
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const read: Record<string, string> = {};
  for (const part of parts) read[part.type] = part.value;
  const hour = read.hour === '24' ? '00' : read.hour;
  if (!read.year) return formatStamp(iso, tz);
  return `${read.year}-${read.month}-${read.day} ${hour}:${read.minute}:${read.second}`;
}

export function transcriptLine(message: StoredMessage, contactName: string, tz: string): string {
  const stamp = transcriptStamp(message.sentAt, tz);
  const speaker = speakerOf(message, contactName);
  if (message.direction === 'system') return `[${stamp}] ${speaker} ${message.messageType}`;
  const text =
    message.text && message.text.trim() !== '' ? message.text.replace(/\r?\n/g, '\n    ') : `(${message.messageType})`;
  return `[${stamp}] ${speaker}: ${text}`;
}

/** The whole transcript, oldest first, with a two-line header. */
export function transcriptText(
  messages: readonly StoredMessage[],
  contact: { id: string; platform: string; name: string },
  tz: string,
): string {
  const sorted = [...messages].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.key.localeCompare(b.key));
  const header = `${contact.name || COPY.breakdown.unnamed} · ${platformLabel(contact.platform)} · ${contact.id}\nTime zone: ${tz}\n`;
  return `${header}\n${sorted.map((m) => transcriptLine(m, contact.name, tz)).join('\n')}\n`;
}
