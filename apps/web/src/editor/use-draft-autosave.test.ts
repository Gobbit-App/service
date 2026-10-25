import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryDraftsKv } from '../test/memory-drafts-kv';
import { emptyDraft, withType, type Draft } from './draft';
import { editDraftKey, newDraftKey, writeDraft, type StoredDraft } from './drafts-store';
import {
  AUTOSAVE_DELAY_MS,
  useDraftAutosave,
  type DraftAutosaveOptions,
} from './use-draft-autosave';

const NOW = new Date('2026-05-01T10:00:00.000Z');
const KEY = newDraftKey('d1', 'text');
const initial = emptyDraft('text', 'c1');
const typed: Draft = { ...initial, title: 'Pancakes' };

function setup(overrides: Partial<DraftAutosaveOptions> = {}, kv = memoryDraftsKv()) {
  const log = vi.fn();
  const props: DraftAutosaveOptions = {
    storageKey: KEY,
    draft: initial,
    initial,
    baseUpdatedAt: null,
    kv,
    now: () => NOW,
    log,
    ...overrides,
  };
  const view = renderHook((p: DraftAutosaveOptions) => useDraftAutosave(p), {
    initialProps: props,
  });
  const rerender = (changes: Partial<DraftAutosaveOptions>) =>
    view.rerender({ ...props, ...changes });
  return { ...view, rerender, kv, log };
}

/** Lets the mount read settle (promises only; timers stay fake). */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDraftAutosave (D145)', () => {
  it('writes 500 ms after the last change', async () => {
    const { rerender, kv } = setup();
    await settle();
    rerender({ draft: { ...initial, title: 'Pan' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    rerender({ draft: typed });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1));
    expect(kv.map.has(KEY)).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(kv.map.get(KEY)).toMatchObject({ v: 1, draft: typed, baseUpdatedAt: null });
  });

  it('writes nothing while the draft is unchanged, and removes it when reverted', async () => {
    const { rerender, kv } = setup();
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2));
    expect(kv.map.size).toBe(0);

    rerender({ draft: typed });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(kv.map.has(KEY)).toBe(true);
    rerender({ draft: initial });
    await settle();
    expect(kv.map.has(KEY)).toBe(false);
  });

  it('offers a stored draft on open and holds writes until answered', async () => {
    const kv = memoryDraftsKv();
    await writeDraft(KEY, typed, null, NOW, kv);
    const { result, rerender } = setup({}, kv);
    await settle();
    expect(result.current.offer).toEqual({ draft: typed, stale: false });

    rerender({ draft: { ...initial, title: 'Other' } });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect((kv.map.get(KEY) as StoredDraft).draft).toEqual(typed);
  });

  it('restore returns the stored draft and clears the offer', async () => {
    const kv = memoryDraftsKv();
    await writeDraft(KEY, typed, null, NOW, kv);
    const { result } = setup({}, kv);
    await settle();
    let restored: Draft | null = null;
    act(() => {
      restored = result.current.restore();
    });
    expect(restored).toEqual(typed);
    expect(result.current.offer).toBeNull();
  });

  it('discard deletes the stored draft', async () => {
    const kv = memoryDraftsKv();
    await writeDraft(KEY, typed, null, NOW, kv);
    const { result } = setup({}, kv);
    await settle();
    act(() => result.current.discard());
    await settle();
    expect(result.current.offer).toBeNull();
    expect(kv.map.has(KEY)).toBe(false);
  });

  it('drops a stored draft that equals what the editor opened with', async () => {
    const kv = memoryDraftsKv();
    await writeDraft(KEY, initial, null, NOW, kv);
    const { result } = setup({}, kv);
    await settle();
    expect(result.current.offer).toBeNull();
    expect(kv.map.has(KEY)).toBe(false);
  });

  it('warns when the card changed on the server since the draft began', async () => {
    const key = editDraftKey('i1');
    const kv = memoryDraftsKv();
    await writeDraft(key, typed, '2026-05-01T09:00:00.000Z', NOW, kv);

    const fresh = setup({ storageKey: key, baseUpdatedAt: '2026-05-01T09:00:00.000Z' }, kv);
    await settle();
    expect(fresh.result.current.offer?.stale).toBe(false);
    fresh.unmount();

    const changed = setup({ storageKey: key, baseUpdatedAt: '2026-05-01T09:30:00.000Z' }, kv);
    await settle();
    expect(changed.result.current.offer?.stale).toBe(true);
  });

  it('keeps the original base after restoring a stale draft', async () => {
    const key = editDraftKey('i1');
    const kv = memoryDraftsKv();
    await writeDraft(key, typed, '2026-05-01T09:00:00.000Z', NOW, kv);
    const { result, rerender } = setup(
      { storageKey: key, baseUpdatedAt: '2026-05-01T09:30:00.000Z' },
      kv,
    );
    await settle();
    act(() => void result.current.restore());
    rerender({ storageKey: key, draft: { ...typed, body: 'more' } });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect((kv.map.get(key) as StoredDraft).baseUpdatedAt).toBe('2026-05-01T09:00:00.000Z');
  });

  it('moves the draft to the new key when the type changes', async () => {
    const { rerender, kv } = setup();
    await settle();
    rerender({ draft: typed });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    const linkKey = newDraftKey('d1', 'link');
    rerender({ storageKey: linkKey, draft: withType(typed, 'link') });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(kv.map.has(KEY)).toBe(false);
    expect(kv.map.has(linkKey)).toBe(true);
  });

  it('clear removes the draft and stops autosaving (successful save)', async () => {
    const { result, rerender, kv } = setup();
    await settle();
    rerender({ draft: typed });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    await act(() => result.current.clear());
    rerender({ draft: { ...typed, body: 'after save' } });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(kv.map.size).toBe(0);
  });

  it('logs storage failures without throwing', async () => {
    const kv = memoryDraftsKv();
    kv.set = () => Promise.reject(new Error('quota'));
    const { rerender, log } = setup({}, kv);
    await settle();
    rerender({ draft: typed });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(log).toHaveBeenCalledWith('[drafts] could not save the draft', expect.any(Error));
  });
});

describe('useDraftAutosave: flush and baseline (D203, D204)', () => {
  it('flush writes at once, before the debounce', async () => {
    const { result, rerender, kv } = setup();
    await settle();
    rerender({ draft: typed });
    act(() => result.current.flush());
    await settle();
    expect(kv.map.get(KEY)).toMatchObject({ draft: typed });
  });

  it('flush writes nothing while unchanged, while an offer is open, or after clear', async () => {
    const unchanged = setup();
    await settle();
    act(() => unchanged.result.current.flush());
    await settle();
    expect(unchanged.kv.map.size).toBe(0);
    unchanged.unmount();

    const kv = memoryDraftsKv();
    await writeDraft(KEY, typed, null, NOW, kv);
    const offered = setup({}, kv);
    await settle();
    offered.rerender({ draft: { ...initial, title: 'Other' } });
    act(() => offered.result.current.flush());
    await settle();
    expect((kv.map.get(KEY) as StoredDraft).draft).toEqual(typed);
    offered.unmount();

    const cleared = setup();
    await settle();
    cleared.rerender({ draft: typed });
    await act(() => cleared.result.current.clear());
    act(() => cleared.result.current.flush());
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(cleared.kv.map.size).toBe(0);
  });

  it('stores nothing when the draft equals a moved baseline', async () => {
    const saved = { ...initial, categoryIds: ['c2'] };
    const { rerender, kv } = setup();
    await settle();
    rerender({ draft: saved, baseline: saved });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS));
    expect(kv.map.size).toBe(0);
  });

  it('does not offer the stored draft again when the baseline moves', async () => {
    const kv = memoryDraftsKv();
    await writeDraft(KEY, typed, null, NOW, kv);
    const { result, rerender } = setup({}, kv);
    await settle();
    act(() => result.current.discard());
    await settle();
    rerender({ baseline: { ...initial, categoryIds: ['c2'] } });
    await settle();
    expect(result.current.offer).toBeNull();
  });
});
