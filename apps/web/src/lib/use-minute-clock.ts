import { useSyncExternalStore } from 'react';

/**
 * 042 (T040): one shared clock for relative times ("In 3 days", "Happening now"). A single timer
 * ticks on each minute boundary while at least one component listens, and stops with the last.
 */
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setTimeout> | null = null;

const MINUTE_MS = 60_000;

function schedule(): void {
  const current = Date.now();
  timer = setTimeout(tick, MINUTE_MS - (current % MINUTE_MS) + 50);
}

function tick(): void {
  now = Date.now();
  for (const listener of listeners) listener();
  schedule();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

const getSnapshot = (): number => now;

/** The current time, updated once a minute (shared by every caller). */
export function useMinuteClock(): Date {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return new Date(ms);
}

/** Test seam: listeners currently subscribed. */
export const minuteClockListenerCount = (): number => listeners.size;
