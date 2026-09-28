import type { PocketbookRow } from '@pb/db';
import { notFound } from '../errors/http-errors';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export async function resolvePocketbook(
  repo: {
    findById(id: string): Promise<PocketbookRow | null>;
    findBySlug(slug: string): Promise<PocketbookRow | null>;
  },
  idOrSlug: string,
): Promise<PocketbookRow> {
  const pocketbook = isUuid(idOrSlug)
    ? await repo.findById(idOrSlug)
    : await repo.findBySlug(idOrSlug);
  if (!pocketbook) {
    throw notFound('Pocketbook not found');
  }
  return pocketbook;
}
