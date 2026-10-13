/** D69: every string leaf of a card payload, joined by a space; skips image `publicId` and calc `expression` (top-level keys). Mirrors SQL item_search_text(). */
export function payloadText(type: string, payload: unknown): string {
  const skipped = new Set<string>();
  if (type === 'image') skipped.add('publicId');
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
