/**
 * Hand the browser a file it writes itself — the design system's
 * `downloadTextFile`, for bytes rather than text. The object URL is revoked a
 * beat later, after the click has been consumed.
 */

// eslint-disable-next-line no-control-regex -- control characters are the very thing this strips
const UNSAFE_NAME = /[\u0000-\u001f\u007f/\\:*?"<>|]/g;
const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

/** A filename the OS will take: no separators, no traversal, no control characters. */
export function safeFileName(name: string, fallback = 'download'): string {
  const cleaned = name
    .replace(UNSAFE_NAME, '-')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 200);
  if (cleaned === '' || RESERVED_NAME.test(cleaned)) return fallback;
  return cleaned;
}

export function downloadBlob(name: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(name);
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
