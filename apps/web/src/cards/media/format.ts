/** `m:ss` (or `h:mm:ss`) for a duration in milliseconds. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "1 page" / "12 pages". */
export function pageCount(pages: number): string {
  return pages === 1 ? '1 page' : `${pages} pages`;
}
