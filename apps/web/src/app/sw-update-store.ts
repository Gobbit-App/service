import { useSyncExternalStore } from 'react';

/**
 * The waiting service worker's "reload into the new version", or null when none is waiting.
 * `ServiceWorkerUpdate` sets it; the ⋯ menu and About offer it, so dismissing the prompt
 * doesn't lose the update.
 */
let applyUpdate: (() => void) | null = null;
const listeners = new Set<() => void>();

export function setPendingUpdate(apply: (() => void) | null): void {
  if (applyUpdate === apply) return;
  applyUpdate = apply;
  for (const listener of listeners) listener();
}

export function pendingUpdate(): (() => void) | null {
  return applyUpdate;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingUpdate(): (() => void) | null {
  return useSyncExternalStore(subscribe, pendingUpdate, () => null);
}
