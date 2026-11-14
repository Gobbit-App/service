/** D69: every string leaf of a card payload, joined by a space; skips calc `expression` and media file ids and facts (045). Mirrors SQL item_search_text(). */
export function payloadText(type: string, payload: unknown): string {
  // D291: a reminder's settings (deadline, unit, dismiss rule, zone) are not text.
  if (type === 'reminder') return '';
  // D372: an event's text is its location and link; time, zone and notify settings are not text.
  if (type === 'event') return eventText(payload);
  // D398/FR-029: every photo's description, a file's description and its file name.
  if (type === 'media') return mediaText(payload);
  const skipped = new Set<string>();
  if (type === 'calc') skipped.add('expression');

  const out: string[] = [];
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    for (const [key, value] of Object.entries(payload)) {
      if (skipped.has(key)) continue;
      collectStrings(value, out);
    }
  } else {
    collectStrings(payload, out);
  }
  return out.join(' ');
}

function mediaText(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') return '';
  const p = payload as { images?: unknown; alt?: unknown; fileName?: unknown };
  const alts = Array.isArray(p.images)
    ? p.images.map((img) => (img as { alt?: unknown } | null)?.alt)
    : [];
  return [...alts, p.alt, p.fileName]
    .filter((v): v is string => typeof v === 'string' && v !== '')
    .join(' ');
}

function eventText(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') return '';
  const p = payload as {
    location?: unknown;
    url?: unknown;
    preview?: { title?: unknown; description?: unknown };
  };
  return [p.location, p.url, p.preview?.title, p.preview?.description]
    .filter((v): v is string => typeof v === 'string' && v !== '')
    .join(' ');
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    if (value !== '') out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) collectStrings(nested, out);
  }
}
