import { useQueryClient } from '@tanstack/react-query';
import type { Deck, Item } from '@pb/shared';
import { can } from '@pb/shared/authz';
import type { ReactElement, ReactNode } from 'react';
import {
  expectedItem,
  INVERSE,
  runLifecycle,
  useLifecycle,
  type LifecycleAction,
} from '../api/item-lifecycle';
import { linkCheckActions } from '../api/link-checks';
import { useOnline } from '../api/offline';
import { lifecycleErrorMessage } from '../api/problem-messages';
import { showToast } from '../ui/toast-store';
import { LinkCheckButtons } from './LinkCheckButtons';

export const DELETE_CONFIRM = 'Delete this card? You can undo it for 30 days.';

const LABEL: Record<LifecycleAction, string> = {
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
 * Role-gated lifecycle buttons for one card (FR-014). `children` is the slot for the
 * editor's Edit button (specs/007). `onDone` runs once an action has been sent optimistically,
 * e.g. the card view returns to the deck after archive or delete.
 */
export function CardActions({
  item,
  deckSlug,
  role,
  onDone,
  children,
}: {
  item: Item;
  deckSlug: string;
  role: Deck['role'];
  onDone?: (action: LifecycleAction) => void;
  children?: ReactNode;
}): ReactElement | null {
  const qc = useQueryClient();
  const online = useOnline();
  const lifecycle = useLifecycle();
  const actions = availableActions(item, role);
  const linkActions = linkCheckActions(item, role);

  if (actions.length === 0 && linkActions.length === 0 && !children) return null;

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

  const disabled = !online || lifecycle.isPending;
  return (
    <div className="card-actions">
      {children}
      <LinkCheckButtons item={item} deckSlug={deckSlug} actions={linkActions} disabled={!online} />
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          className={action === 'delete' ? 'button button--danger' : 'button button--ghost'}
          disabled={disabled}
          onClick={() => run(action)}
        >
          {LABEL[action]}
        </button>
      ))}
      {!online && (
        <span className="card-actions__hint">Offline: these actions need a connection.</span>
      )}
    </div>
  );
}
