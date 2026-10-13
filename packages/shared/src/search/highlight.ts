export interface HighlightSegment {
  text: string;
  hit: boolean;
}

const STRIP = /[\u0591-\u05BD\u05BF-\u05C7\u0300-\u036F]/;

interface Folded {
  chars: string;
  starts: number[];
  ends: number[];
}

function fold(text: string): Folded {
  let chars = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i) ?? 0;
    const len = cp > 0xffff ? 2 : 1;
    const next = i + len;
    const ch = text.slice(i, next);
    for (const d of ch.normalize('NFD')) {
      if (STRIP.test(d)) {
        if (ends.length > 0) ends[ends.length - 1] = next;
        continue;
      }
      const lower = d.toLowerCase().replace(/ς/g, 'σ');
      for (let k = 0; k < lower.length; k++) {
        chars += lower[k];
        starts.push(i);
        ends.push(next);
      }
    }
    i = next;
  }
  return { chars, starts, ends };
}

/** Client-side highlight (D76): query tokens matched case/diacritic-insensitively; returns [start, end) ranges in original `text` indices, merged and sorted. */
export function highlightRanges(text: string, query: string): Array<[number, number]> {
  const { chars, starts, ends } = fold(text);
  const found: Array<[number, number]> = [];
  for (const raw of query.split(/\s+/)) {
    if (raw.length < 2) continue;
    const token = fold(raw).chars;
    if (token.length === 0) continue;
    let pos = 0;
    for (;;) {
      const idx = chars.indexOf(token, pos);
      if (idx < 0) break;
      const endIdx = idx + token.length - 1;
      found.push([starts[idx] ?? 0, ends[endIdx] ?? 0]);
      pos = idx + token.length;
    }
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const r of found) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) {
      last[1] = Math.max(last[1], r[1]);
    } else {
      merged.push([r[0], r[1]]);
    }
  }
  return merged;
}

/** Splits `text` into alternating plain/hit segments from `highlightRanges`. Empty query → one plain segment. */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const ranges = highlightRanges(text, query);
  if (ranges.length === 0) return [{ text, hit: false }];
  const segments: HighlightSegment[] = [];
  let cur = 0;
  for (const [s, e] of ranges) {
    if (s > cur) segments.push({ text: text.slice(cur, s), hit: false });
    segments.push({ text: text.slice(s, e), hit: true });
    cur = e;
  }
  if (cur < text.length) segments.push({ text: text.slice(cur), hit: false });
  return segments;
}
