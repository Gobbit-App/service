import slugify from '@sindresorhus/slugify';
import { SLUG_MAX } from '@pb/shared';

export function toSlug(input: string): string {
  const slugified = slugify(input);
  const truncated = slugified.slice(0, SLUG_MAX);
  const trimmed = truncated.replace(/-+$/, '');
  return trimmed;
}
