import { useCallback, useEffect, useState } from 'react';
import type * as PageViewerModule from './PageViewer';
import type * as VideoPlayerModule from './VideoPlayer';
import type * as AudioPlayerModule from './AudioPlayer';

/** D400: the media code that loads only on intent or idle (never in the initial bundle). */
export type MediaModules = {
  viewer: typeof PageViewerModule;
  video: typeof VideoPlayerModule;
  audio: typeof AudioPlayerModule;
};
export type MediaModuleName = keyof MediaModules;

type Importers = { [K in MediaModuleName]: () => Promise<MediaModules[K]> };

const defaultImporters: Importers = {
  viewer: () => import('./PageViewer'),
  video: () => import('./VideoPlayer'),
  audio: () => import('./AudioPlayer'),
};
let importers: Importers = defaultImporters;

const loaded = new Map<MediaModuleName, unknown>();
const pending = new Map<MediaModuleName, Promise<unknown>>();

/** Test-only: swap the importers and forget what was loaded. */
export function resetMediaModules(next: Partial<Importers> = {}): void {
  importers = { ...defaultImporters, ...next };
  loaded.clear();
  pending.clear();
}

/** The module, once loaded (a facade renders its player at once). */
export function loadedMediaModule<K extends MediaModuleName>(name: K): MediaModules[K] | null {
  return (loaded.get(name) as MediaModules[K] | undefined) ?? null;
}

/** Loads a module once (D290 pattern); a failed load is forgotten so it can be retried. */
export function loadMediaModule<K extends MediaModuleName>(name: K): Promise<MediaModules[K]> {
  const done = loadedMediaModule(name);
  if (done) return Promise.resolve(done);
  const inFlight = pending.get(name) as Promise<MediaModules[K]> | undefined;
  if (inFlight) return inFlight;
  const promise = (importers[name] as () => Promise<MediaModules[K]>)().then(
    (module) => {
      loaded.set(name, module);
      pending.delete(name);
      return module;
    },
    (error: unknown) => {
      pending.delete(name);
      throw error;
    },
  );
  pending.set(name, promise);
  return promise;
}

/** True when the connection asks to save data (no idle prefetch then). */
export function savesData(): boolean {
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/**
 * D400: starts loading a module on intent (pointer down, focus, hover) or, with `idle`, when a
 * card has been on screen a while, unless the connection saves data. Never throws.
 */
export function prefetchMediaModule(name: MediaModuleName, { idle = false } = {}): void {
  if (idle && savesData()) return;
  loadMediaModule(name).catch(() => undefined);
}

export type MediaModuleState<K extends MediaModuleName> =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; module: MediaModules[K] }
  | { status: 'failed' };

/**
 * The module once `wanted`; a failed load (offline, stale deploy) reports `failed` and `retry`
 * tries again, so the facade can say "Couldn't open · Retry" instead of an error boundary.
 */
export function useMediaModule<K extends MediaModuleName>(name: K, wanted: boolean) {
  const [state, setState] = useState<MediaModuleState<K>>(() => {
    const ready = loadedMediaModule(name);
    return ready ? { status: 'ready', module: ready } : { status: 'idle' };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wanted || state.status !== 'idle') return;
    let live = true;
    loadMediaModule(name).then(
      (module) => live && setState({ status: 'ready', module }),
      () => live && setState({ status: 'failed' }),
    );
    return () => {
      live = false;
    };
  }, [name, wanted, attempt, state.status]);

  const retry = useCallback(() => {
    setState({ status: 'idle' });
    setAttempt((n) => n + 1);
  }, []);
  // Wanted but not settled yet reads as loading, without a state change in the effect.
  const shown: MediaModuleState<K> =
    wanted && state.status === 'idle' ? { status: 'loading' } : state;
  return { state: shown, retry };
}
