import { createHash } from 'node:crypto';
import slugify from '@sindresorhus/slugify';
import { SLUG_MAX } from '@gobbit/shared';

export function toSlug(input: string): string {
  const slugified = slugify(input);
  const truncated = slugified.slice(0, SLUG_MAX);
  const trimmed = truncated.replace(/-+$/, '');
  return trimmed;
}

// Non-Latin names slugify to '' — fall back to a stable hash address (D445).
export function toCategorySlug(name: string): string {
  const slug = toSlug(name);
  if (slug) return slug;
  const hash = createHash('sha256').update(name.normalize('NFC').toLowerCase()).digest('hex');
  return `c-${hash.slice(0, 8)}`;
}
