import { useSyncExternalStore } from 'react';

/** One toast: a message and at most one action (D146: Undo after archive and delete). */
export type ToastSpec = {
  message: string;
  action?: { label: string; onAction: () => void };
};

export type ToastEntry = ToastSpec & { id: number };

/**
 * The single app-wide toast. It lives outside React so a toast raised on the card view
 * survives the navigation back to the deck list (quickstart §4.2).
 */
let current: ToastEntry | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Shows `spec`, replacing any toast on screen; returns its id. */
export function showToast(spec: ToastSpec): number {
  current = { ...spec, id: nextId++ };
  emit();
  return current.id;
}

/** Hides the toast `id` (a no-op when a newer toast replaced it). */
export function dismissToast(id: number): void {
  if (current?.id !== id) return;
  current = null;
  emit();
}

export function currentToast(): ToastEntry | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToast(): ToastEntry | null {
  return useSyncExternalStore(subscribe, currentToast, () => null);
}
