import { useEffect, useState } from 'react';
import type { CreatableType } from '../creatable-types';
import type { DraftsKv } from '../drafts-store';
import { latestNewDraftType, pickStartType, type StartScreen } from './pick-start-type';

/**
 * D302: the new-card route's start screen, or null while the drafts store is being read (only
 * read when the URL names no type). A failed read (no IndexedDB) falls back to the chooser.
 */
export function useStartScreen({
  deckId,
  urlType,
  imagesOff,
  kv,
}: {
  deckId: string;
  urlType: CreatableType | undefined;
  imagesOff: boolean;
  kv?: DraftsKv;
}): StartScreen | null {
  const [draftType, setDraftType] = useState<{ deckId: string; type: CreatableType | null } | null>(
    null,
  );
  const needsDrafts = urlType === undefined;

  useEffect(() => {
    if (!needsDrafts) return;
    let live = true;
    latestNewDraftType(deckId, kv)
      .catch(() => null)
      .then((type) => {
        if (live) setDraftType({ deckId, type });
      });
    return () => {
      live = false;
    };
  }, [deckId, needsDrafts, kv]);

  if (needsDrafts && draftType?.deckId !== deckId) return null;
  return pickStartType({ urlType, draftType: draftType?.type ?? null, imagesOff });
}
