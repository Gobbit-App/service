import { useQueryClient } from '@tanstack/react-query';
import type { Deck, Item } from '@pb/shared';
import { can } from '@pb/shared/authz';
import {
  expectedItem,
  INVERSE,
  runLifecycle,
  useLifecycle,
  type LifecycleAction,
} from '../api/item-lifecycle';
import { lifecycleErrorMessage } from '../api/problem-messages';
import { showToast } from '../ui/toast-store';

export const DELETE_CONFIRM = 'Delete this card? You can undo it for 30 days.';

export const LIFECYCLE_LABEL: Record<LifecycleAction, string> = {
  archive: 'Archive',
  restore: 'Restore',
  delete: 'Delete',
  undelete: 'Undelete',
};

const DONE: Record<LifecycleAction, string> = {
  archive: 'Card archived',
  restore: 'Card restored',
  delete: 'Card deleted',
  undelete: 'Card restored',
};

const FAILED: Record<LifecycleAction, string> = {
  archive: "Couldn't archive the card.",
  restore: "Couldn't restore the card.",
  delete: "Couldn't delete the card.",
  undelete: "Couldn't undelete the card.",
};

/** Archive and delete offer Undo (D146); restore and undelete are themselves the undo. */
const OFFERS_UNDO: ReadonlySet<LifecycleAction> = new Set(['archive', 'delete']);

/** Which actions `role` gets for a card in this state; proposals belong to review. */
export function availableActions(item: Item, role: Deck['role']): LifecycleAction[] {
  if (item.status === 'proposed') return [];
  if (item.deletedAt !== undefined) return can(role, 'item.delete') ? ['undelete'] : [];

  const actions: LifecycleAction[] = [];
  if (can(role, 'item.archive')) actions.push(item.status === 'archived' ? 'restore' : 'archive');
  if (can(role, 'item.delete')) actions.push('delete');
  return actions;
}

/**
 * FR-014 / D146 (moved from CardActions in 024): run a lifecycle action optimistically, toast
 * the result with Undo, and confirm a delete first. `onDone` runs once the action was sent,
 * e.g. the card page returns to the deck after archive or delete.
 */
export function useCardLifecycle({
  item,
  deckSlug,
  onDone,
}: {
  item: Item;
  deckSlug: string;
  onDone?: (action: LifecycleAction) => void;
}): { run: (action: LifecycleAction) => void; isPending: boolean } {
  const qc = useQueryClient();
  const lifecycle = useLifecycle();

  function fail(action: LifecycleAction, error: unknown): void {
    showToast({ message: lifecycleErrorMessage(error, FAILED[action]) });
  }

  function undo(action: LifecycleAction): void {
    const inverse = INVERSE[action];
    const change = { item: expectedItem(item, action), deckSlug, action: inverse };
    runLifecycle(qc, change).catch((error: unknown) => fail(inverse, error));
  }

  function run(action: LifecycleAction): void {
    if (action === 'delete' && !window.confirm(DELETE_CONFIRM)) return;

    // mutateAsync: the failure toast still shows after the card view has unmounted
    lifecycle
      .mutateAsync({ item, deckSlug, action })
      .catch((error: unknown) => fail(action, error));
    showToast({
      message: DONE[action],
      action: OFFERS_UNDO.has(action) ? { label: 'Undo', onAction: () => undo(action) } : undefined,
    });
    onDone?.(action);
  }

  return { run, isPending: lifecycle.isPending };
}
