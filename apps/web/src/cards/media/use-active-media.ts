import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * D400: at most one video or audio player is alive at a time. Activating one returns the
 * previous one to its facade (its element unmounts, which pauses it and releases its buffer).
 * Leaving the deck or Browse's current card does the same through `releaseActiveMedia`.
 */
let active: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setActiveMedia(id: string | null): void {
  if (active === id) return;
  active = id;
  emit();
}

/** Returns every player to its facade (Browse moved on, the deck closed). */
export function releaseActiveMedia(): void {
  setActiveMedia(null);
}

export function activeMediaId(): string | null {
  return active;
}

export function useActiveMedia(id: string) {
  const current = useSyncExternalStore(
    subscribe,
    () => active,
    () => null,
  );
  const activate = useCallback(() => setActiveMedia(id), [id]);
  const release = useCallback(() => {
    if (active === id) setActiveMedia(null);
  }, [id]);
  // A card that leaves the screen for good (deck closed, card deleted) frees its player.
  useEffect(
    () => () => {
      if (active === id) setActiveMedia(null);
    },
    [id],
  );
  return { isActive: current === id, activate, release };
}
