import type { Deck, Item } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';

/**
 * R8: who sees "Edit". Mirrors the API (`item.update`, and D96 for proposals: only the creator
 * or a publisher). A deleted card is never editable.
 */
export function canEditItem(
  item: Pick<Item, 'status' | 'createdBy' | 'deletedAt'>,
  role: Deck['role'] | undefined,
  meId: string | undefined,
): boolean {
  if (!role || item.deletedAt !== undefined || !can(role, 'item.update')) return false;
  if (item.status !== 'proposed') return true;
  return can(role, 'item.publish') || (meId !== undefined && item.createdBy === meId);
}

export interface EditOpener {
  /** D135: opened from the review queue; returns there after saving a proposal. */
  from?: 'review';
  /** D320: the page the editor was opened from (a `safeReturnPath`); back, Cancel and Save go there. */
  back?: string | null;
}

/** D135: the editor route for a card. */
export function editHref(itemId: string, opener: EditOpener = {}): string {
  const search = new URLSearchParams();
  if (opener.from) search.set('from', opener.from);
  if (opener.back) search.set('back', opener.back);
  const query = search.toString();
  return `/i/${itemId}/edit${query ? `?${query}` : ''}`;
}
