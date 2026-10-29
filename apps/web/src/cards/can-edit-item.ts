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

/** D135: the editor route for a card; `from=review` returns to the queue after saving. */
export function editHref(itemId: string, from?: 'review'): string {
  return `/i/${itemId}/edit${from ? `?from=${from}` : ''}`;
}
