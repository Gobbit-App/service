export const AVATAR_PALETTE_SIZE = 10;

const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** First letter's grapheme (so combining marks stay), upper-cased; '' when there is no letter. */
function firstLetter(s: string | null | undefined): string {
  const str = s ?? '';
  const i = str.search(/\p{L}/u);
  if (i < 0) return '';
  const first = seg.segment(str.slice(i))[Symbol.iterator]().next().value;
  return first ? first.segment.toLocaleUpperCase() : '';
}

export function initialsFor(p: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const names = [firstLetter(p.firstName), firstLetter(p.lastName)].filter(Boolean);
  if (names.length) return names.join('');
  const parts = (p.email ?? '')
    .split('@')[0]!
    .split(/[.\-_]/)
    .map(firstLetter)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0]! : parts[0]! + parts[parts.length - 1]!;
}

/** FNV-1a (32-bit) of the id, modulo the palette size. */
export function avatarColorIndex(userId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % AVATAR_PALETTE_SIZE;
}
