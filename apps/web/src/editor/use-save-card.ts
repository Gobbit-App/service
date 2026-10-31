import { useState } from 'react';
import type { Deck, Item } from '@gobbit/shared';
import { useCreateItem } from '../api/create-item';
import { useOnline } from '../api/offline';
import { useUpdateItem } from '../api/update-item';
import { deckHref } from '../ui/chip-order';
import { useNavigateHref } from '../ui/NavLink';
import { toCreateBody, toPatch, type Draft } from './draft';
import { OFFLINE_SAVE, problemToErrors, type SaveErrors } from './problem-fields';

export type SaveTarget =
  { mode: 'create'; deck: Deck } | { mode: 'edit'; deck: Deck; item: Item; from?: 'review' };

/** Where the editor goes after a successful save (R9). */
export function afterSaveHref(target: SaveTarget, saved: Item | null): string {
  if (target.mode === 'create') return deckHref(target.deck.slug);
  const status = (saved ?? target.item).status;
  if (target.from === 'review' && status === 'proposed') {
    return deckHref(target.deck.slug, 'review');
  }
  return `/i/${target.item.id}`;
}

/**
 * Create (POST) or edit (minimal PATCH, D137). Failures map to field and form errors and the
 * draft stays on screen; offline never sends. `onSaved` runs before navigating (drafts cleanup).
 */
export function useSaveCard(target: SaveTarget, onSaved?: () => Promise<void> | void) {
  const create = useCreateItem(target.deck.slug);
  const update = useUpdateItem(target.deck.slug);
  const online = useOnline();
  const navigate = useNavigateHref();
  const [errors, setErrors] = useState<SaveErrors | null>(null);

  const finish = async (saved: Item | null) => {
    await onSaved?.();
    // Saved: nothing is left to lose, so the unsaved-changes guard must not ask (FR-010).
    navigate(afterSaveHref(target, saved), { ignoreBlocker: true });
  };

  async function save(draft: Draft): Promise<void> {
    if (!online) {
      setErrors({ fields: {}, form: OFFLINE_SAVE });
      return;
    }
    setErrors(null);
    try {
      if (target.mode === 'create') {
        await finish(await create.mutateAsync(toCreateBody(draft)));
        return;
      }
      const patch = toPatch(target.item, draft);
      if (!patch) {
        await finish(null);
        return;
      }
      await finish(await update.mutateAsync({ itemId: target.item.id, patch }));
    } catch (error) {
      setErrors(problemToErrors(error));
    }
  }

  return {
    save,
    saving: create.isPending || update.isPending,
    errors,
    clearErrors: () => setErrors(null),
  };
}
