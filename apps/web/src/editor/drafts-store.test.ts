import { describe, expect, it } from 'vitest';
import { emptyDraft } from './draft';
import {
  clearDrafts,
  deleteDraft,
  editDraftKey,
  newDraftKey,
  readDraft,
  writeDraft,
} from './drafts-store';
import { memoryDraftsKv } from '../test/memory-drafts-kv';

const NOW = new Date('2026-05-01T10:00:00.000Z');

describe('drafts-store', () => {
  it('builds keys per deck and type for new cards and per item for edits', () => {
    expect(newDraftKey('d1', 'table')).toBe('new:d1:table');
    expect(editDraftKey('i1')).toBe('edit:i1');
  });

  it('writes and reads a versioned draft', async () => {
    const kv = memoryDraftsKv();
    const draft = { ...emptyDraft('text', 'c1'), title: 'Hi' };
    await writeDraft('edit:i1', draft, '2026-04-01T00:00:00.000Z', NOW, kv);
    expect(await readDraft('edit:i1', kv)).toEqual({
      v: 1,
      draft,
      baseUpdatedAt: '2026-04-01T00:00:00.000Z',
      savedAt: NOW.toISOString(),
    });
  });

  it('returns null for a missing key', async () => {
    expect(await readDraft('new:d1:text', memoryDraftsKv())).toBeNull();
  });

  it('discards a draft with an unknown version', async () => {
    const kv = memoryDraftsKv();
    kv.map.set('edit:i1', { v: 2, draft: {}, savedAt: 'x', baseUpdatedAt: null });
    expect(await readDraft('edit:i1', kv)).toBeNull();
    expect(kv.map.has('edit:i1')).toBe(false);
  });

  it('deletes one draft', async () => {
    const kv = memoryDraftsKv();
    await writeDraft('a', emptyDraft('text', null), null, NOW, kv);
    await writeDraft('b', emptyDraft('text', null), null, NOW, kv);
    await deleteDraft('a', kv);
    expect([...kv.map.keys()]).toEqual(['b']);
  });

  it('clears every draft', async () => {
    const kv = memoryDraftsKv();
    await writeDraft('a', emptyDraft('text', null), null, NOW, kv);
    await writeDraft('b', emptyDraft('text', null), null, NOW, kv);
    await clearDrafts(kv);
    expect(kv.map.size).toBe(0);
  });

  it('restores a pre-045 photo draft under the media key as a media card (FR-021)', async () => {
    const kv = memoryDraftsKv();
    const old = {
      ...emptyDraft('text', 'c1'),
      type: 'image',
      title: 'Bread',
      payload: { publicId: 'p', alt: 'Loaf' },
    };
    kv.map.set('new:d1:image', { v: 1, draft: old, baseUpdatedAt: null, savedAt: 'x' });

    const read = await readDraft(newDraftKey('d1', 'media'), kv);
    expect(read?.draft).toMatchObject({
      type: 'media',
      title: 'Bread',
      payload: { kind: 'image', images: [{ publicId: 'p', alt: 'Loaf' }] },
    });
    expect(kv.map.has('new:d1:image')).toBe(false);
    expect(kv.map.has('new:d1:media')).toBe(true);
  });
});
