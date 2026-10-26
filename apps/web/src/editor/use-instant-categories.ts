import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Item } from '@pb/shared';
import { isApiError } from '../api/api-error';
import { api, unwrap } from '../api/client';
import { applyUpdatedItem } from '../api/update-item';
import { showToast } from '../ui/toast-store';
import { createCategorySaver, type CategorySaver, type SaveKind } from './category-saver';

export const CATEGORIES_SAVED = 'Categories saved';
export const CATEGORIES_RESTORED = 'Categories restored';
export const CATEGORIES_FAILED = "Couldn't save the categories. They're back as they were.";
export const CATEGORIES_OFFLINE = "You're offline. Categories weren't saved.";
export const UNDO_FAILED = "Couldn't undo the category change.";
export const LAST_CATEGORY = 'A published card needs at least one category.';

export type InstantCategories = {
  /** What the chips show. */
  selection: string[];
  change: (ids: string[]) => void;
  /** Why the last tap was refused (FR-008), or null. */
  refusal: string | null;
};

function failureMessage(error: unknown, kind: SaveKind): string {
  if (!isApiError(error)) return CATEGORIES_OFFLINE;
  return kind === 'restored' ? UNDO_FAILED : CATEGORIES_FAILED;
}

/**
 * D207: category taps on an existing card save on their own (one PATCH per 600 ms burst), with
 * the app toast offering Undo. `onSaved` gets each saved card so the editor can move its baseline
 * (D208). A pending burst is sent when the editor unmounts. Null `item` (a new card) = off.
 */
export function useInstantCategories(
  item: Item | null,
  deckSlug: string,
  onSaved: (saved: Item) => void,
): InstantCategories | null {
  const qc = useQueryClient();
  /** Null until the first tap: the chips follow the card until then. */
  const [selection, setSelection] = useState<string[] | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  const saverRef = useRef<CategorySaver | null>(null);

  // Leaving the editor sends a pending burst (SC-004); the request outlives the component.
  useEffect(() => () => saverRef.current?.dispose(), []);

  if (!item) return null;

  /** Created on the first tap, from the card as it is then. */
  const getSaver = (): CategorySaver => {
    if (saverRef.current) return saverRef.current;
    const itemId = item.id;
    const created: CategorySaver = createCategorySaver<Item>({
      initial: item.categoryIds,
      save: async (categoryIds) => {
        const saved = await unwrap(
          api.PATCH('/items/{id}', { params: { path: { id: itemId } }, body: { categoryIds } }),
        );
        applyUpdatedItem(qc, deckSlug, saved).catch((err: unknown) =>
          console.error('[categories] could not refresh the card lists', err),
        );
        return saved;
      },
      onSelection: setSelection,
      onSaved: (saved, kind, undoTarget) => {
        onSavedRef.current(saved);
        showToast(
          kind === 'saved'
            ? {
                message: CATEGORIES_SAVED,
                action: { label: 'Undo', onAction: () => created.undo(undoTarget) },
              }
            : { message: CATEGORIES_RESTORED },
        );
      },
      onError: (error, kind) => showToast({ message: failureMessage(error, kind) }),
    });
    saverRef.current = created;
    return created;
  };

  const change = (ids: string[]) => {
    // FR-008 / D6: a published card keeps at least one category. Proposals may have none.
    if (item.status === 'published' && ids.length === 0) {
      setRefusal(LAST_CATEGORY);
      return;
    }
    setRefusal(null);
    getSaver().change(ids);
  };

  return { selection: selection ?? item.categoryIds, change, refusal };
}
