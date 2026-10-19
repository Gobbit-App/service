import type { Item } from '@pb/shared';
import { relativeTime } from './relative-time';

/** Edits closer than this to creation (same request, publish in one go) still read as "Added". */
const EDIT_GRACE_MS = 60_000;

export type CardAge = {
  /** e.g. "Added 3 weeks ago", "Edited yesterday". */
  label: string;
  /** The instant the label describes (for `<time dateTime>` and the hover title). */
  at: Date;
};

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * When a card was added, or last edited when that came later. `updatedAt` only moves on content
 * changes (DB trigger), never on favorites or embeddings, so "Edited" means someone changed it.
 */
export function cardAge(
  item: Pick<Item, 'createdAt' | 'updatedAt'>,
  now: Date,
  locale = 'en',
): CardAge | null {
  const created = parse(item.createdAt);
  if (!created) return null;
  const updated = parse(item.updatedAt);

  if (updated && updated.getTime() - created.getTime() > EDIT_GRACE_MS) {
    return { label: `Edited ${relativeTime(updated, now, locale)}`, at: updated };
  }
  return { label: `Added ${relativeTime(created, now, locale)}`, at: created };
}
