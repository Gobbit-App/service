import { describe, expect, it } from 'vitest';
import { clearPending, readPending, savePending, type ShareKv } from './share-store';
import { SHARE_TTL_MS, type SharedPayload } from './share-payload';

function memoryKv(): ShareKv & { map: Map<string, unknown> } {
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
  };
}

function payload(id = 'p1', createdAt = 1000): SharedPayload {
  return { id, createdAt, title: '', text: 'hi', url: '', files: [] };
}

describe('share-store', () => {
  it('readPending returns the saved payload for its id', async () => {
    const kv = memoryKv();
    const p = payload();
    await savePending(p, kv);
    expect(await readPending('p1', 1000, kv)).toEqual(p);
  });

  it('readPending with another id returns null and keeps the record', async () => {
    const kv = memoryKv();
    await savePending(payload(), kv);
    expect(await readPending('other', 1000, kv)).toBeNull();
    expect(kv.map.size).toBe(1);
    expect(await readPending('p1', 1000, kv)).toEqual(payload());
  });

  it('a second savePending replaces the first', async () => {
    const kv = memoryKv();
    await savePending(payload('p1'), kv);
    const second = payload('p2', 2000);
    await savePending(second, kv);
    expect(await readPending('p1', 2000, kv)).toBeNull();
    expect(await readPending('p2', 2000, kv)).toEqual(second);
  });

  it('an expired payload returns null and is removed', async () => {
    const kv = memoryKv();
    await savePending(payload(), kv);
    const now = 1000 + SHARE_TTL_MS + 1;
    expect(await readPending('p1', now, kv)).toBeNull();
    expect(kv.map.size).toBe(0);
  });

  it('readPending on an empty store returns null', async () => {
    const kv = memoryKv();
    expect(await readPending('p1', 1000, kv)).toBeNull();
  });

  it('clearPending empties the store', async () => {
    const kv = memoryKv();
    await savePending(payload(), kv);
    await clearPending(kv);
    expect(kv.map.size).toBe(0);
  });
});
