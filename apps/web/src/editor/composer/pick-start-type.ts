import { CREATABLE_TYPES, type CreatableType } from '../creatable-types';
import { newDraftKey, readDraft, type DraftsKv } from '../drafts-store';

export type StartScreen = { kind: 'chooser' } | { kind: 'composer'; type: CreatableType };

const CHOOSER: StartScreen = { kind: 'chooser' };

/**
 * D302 (039): what `/d/{slug}/new` opens on.
 * - `?type=` naming a type the deck can use → the composer on it;
 * - `?type=image` without image storage → the chooser (Image shows why it's unavailable);
 * - no `?type=` but an unsaved new-card draft → the composer on that draft's type (its restore offer shows);
 * - otherwise the chooser.
 */
export function pickStartType({
  urlType,
  draftType,
  imagesOff,
}: {
  urlType: CreatableType | undefined;
  draftType: CreatableType | null;
  imagesOff: boolean;
}): StartScreen {
  const usable = (type: CreatableType) => !(type === 'image' && imagesOff);
  if (urlType) return usable(urlType) ? { kind: 'composer', type: urlType } : CHOOSER;
  if (draftType && usable(draftType)) return { kind: 'composer', type: draftType };
  return CHOOSER;
}

/** The type of the deck's most recently saved new-card draft, or null when there is none. */
export async function latestNewDraftType(
  deckId: string,
  kv?: DraftsKv,
): Promise<CreatableType | null> {
  const stored = await Promise.all(
    CREATABLE_TYPES.map(async (type) => ({
      type,
      draft: await readDraft(newDraftKey(deckId, type), kv),
    })),
  );
  let latest: { type: CreatableType; savedAt: string } | null = null;
  for (const { type, draft } of stored) {
    if (draft && (!latest || draft.savedAt > latest.savedAt))
      latest = { type, savedAt: draft.savedAt };
  }
  return latest?.type ?? null;
}
