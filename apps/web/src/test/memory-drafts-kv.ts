import type { DraftsKv } from '../editor/drafts-store';

/** An in-memory `DraftsKv` for tests (jsdom has no IndexedDB). */
export function memoryDraftsKv(): DraftsKv & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (k) => map.get(k),
    set: async (k, v) => {
      map.set(k, v);
    },
    del: async (k) => {
      map.delete(k);
    },
    clear: async () => {
      map.clear();
    },
  };
}
