const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** D188: `?item=<id>` narrows the activity log to one card; anything else is dropped. */
export function parseLogSearch(search: Record<string, unknown>): { item?: string } {
  return typeof search.item === 'string' && UUID_RE.test(search.item) ? { item: search.item } : {};
}
