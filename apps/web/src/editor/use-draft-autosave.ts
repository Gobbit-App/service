import { useCallback, useEffect, useRef, useState } from 'react';
import { isDirty, type Draft } from './draft';
import {
  deleteDraft,
  idbDraftsKv,
  readDraft,
  writeDraft,
  type DraftsKv,
  type StoredDraft,
} from './drafts-store';

export const AUTOSAVE_DELAY_MS = 500;

export type DraftAutosaveOptions = {
  /** `newDraftKey(deckId, type)` or `editDraftKey(itemId)`; may change with the type (create). */
  storageKey: string;
  draft: Draft;
  /** What the editor opened with; nothing is stored while the draft equals it. */
  initial: Draft;
  /** Edit: the card's `updatedAt` when editing began. Null for a new card. */
  baseUpdatedAt: string | null;
  kv?: DraftsKv;
  now?: () => Date;
  log?: (message: string, err: unknown) => void;
};

export type DraftOffer = {
  draft: Draft;
  /** The card changed on the server after this draft began (edit only). */
  stale: boolean;
};

type PendingOffer = { key: string; stored: StoredDraft };

function isStale(stored: StoredDraft, current: string | null): boolean {
  if (stored.baseUpdatedAt === null || current === null) return false;
  return Date.parse(current) > Date.parse(stored.baseUpdatedAt);
}

const defaultLog = (message: string, err: unknown) => console.error(message, err);

/**
 * D145 / FR-013: stores the draft 500 ms after the last change while it differs from what the
 * editor opened with, and offers a stored draft on open. Nothing is written until the offer is
 * answered, so an unanswered offer is never overwritten. Storage failures (private mode, no
 * IndexedDB) are logged and never block editing.
 */
export function useDraftAutosave({
  storageKey,
  draft,
  initial,
  baseUpdatedAt,
  kv: kvOption,
  now = () => new Date(),
  log = defaultLog,
}: DraftAutosaveOptions) {
  const [kv] = useState(() => kvOption ?? idbDraftsKv());
  const [openKey] = useState(storageKey);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<PendingOffer | null>(null);
  const [base, setBase] = useState(baseUpdatedAt);
  /** The key the draft was last written to, so a type switch moves it and a revert removes it. */
  const writtenKey = useRef<string | null>(null);
  const closed = useRef(false);
  const logRef = useRef(log);
  const nowRef = useRef(now);
  useEffect(() => {
    logRef.current = log;
    nowRef.current = now;
  });

  const quietly = useCallback((work: Promise<unknown>, what: string) => {
    work.catch((err: unknown) => logRef.current(`[drafts] could not ${what}`, err));
  }, []);

  useEffect(() => {
    let alive = true;
    readDraft(openKey, kv)
      .then((stored) => {
        if (!alive) return;
        if (stored && isDirty(stored.draft, initial)) setPending({ key: openKey, stored });
        else if (stored) quietly(deleteDraft(openKey, kv), 'remove an unchanged draft');
      })
      .catch((err: unknown) => logRef.current('[drafts] could not read the stored draft', err))
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [openKey, kv, initial, quietly]);

  const dirty = isDirty(draft, initial);
  useEffect(() => {
    if (!loaded || pending || closed.current) return;
    if (!dirty) {
      const previous = writtenKey.current;
      writtenKey.current = null;
      if (previous) quietly(deleteDraft(previous, kv), 'remove the draft');
      return;
    }
    const timer = setTimeout(() => {
      const previous = writtenKey.current;
      writtenKey.current = storageKey;
      quietly(writeDraft(storageKey, draft, base, nowRef.current(), kv), 'save the draft');
      if (previous && previous !== storageKey) {
        quietly(deleteDraft(previous, kv), 'remove the previous draft');
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loaded, pending, dirty, draft, storageKey, base, kv, quietly]);

  const offer: DraftOffer | null = pending
    ? { draft: pending.stored.draft, stale: isStale(pending.stored, baseUpdatedAt) }
    : null;

  /** Accepts the offer; the caller puts the returned draft on screen. */
  const restore = (): Draft | null => {
    if (!pending) return null;
    writtenKey.current = pending.key;
    setBase(pending.stored.baseUpdatedAt);
    setPending(null);
    return pending.stored.draft;
  };

  const discard = (): void => {
    if (!pending) return;
    quietly(deleteDraft(pending.key, kv), 'discard the draft');
    setPending(null);
  };

  /** After a successful save: stop autosaving and remove the stored draft. */
  const clear = async (): Promise<void> => {
    closed.current = true;
    const keys = new Set([storageKey, openKey, writtenKey.current].filter(Boolean) as string[]);
    writtenKey.current = null;
    await Promise.all([...keys].map((key) => deleteDraft(key, kv))).catch((err: unknown) =>
      logRef.current('[drafts] could not remove the saved draft', err),
    );
  };

  return { offer, restore, discard, clear };
}
