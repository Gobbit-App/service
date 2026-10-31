import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '@gobbit/shared';
import { ApiError } from '../api/api-error';
import { requests, respond } from '../test/api-mock';
import { makeItem } from '../test/fixtures';
import { testQueryClient } from '../test/render';
import { currentToast, dismissToast } from '../ui/toast-store';
import { BURST_MS } from './category-saver';
import {
  CATEGORIES_FAILED,
  CATEGORIES_OFFLINE,
  CATEGORIES_RESTORED,
  CATEGORIES_SAVED,
  LAST_CATEGORY,
  UNDO_FAILED,
  useInstantCategories,
} from './use-instant-categories';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));

function setup(item: Item | null, onSaved = vi.fn()) {
  const client = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useInstantCategories(item, 'family', onSaved), { wrapper });
  return { ...hook, onSaved };
}

/** Answers PATCH /items/{id} with the card carrying the sent categories. */
function echoPatch(item: Item) {
  respond.mockImplementation(async (request) => {
    if (request !== 'PATCH /items/{id}') throw new Error(`unexpected ${request}`);
    const body = (requests.mock.lastCall?.[1] as { body: { categoryIds: string[] } }).body;
    return { ...item, categoryIds: body.categoryIds, updatedAt: new Date().toISOString() };
  });
}

const patchBodies = () =>
  requests.mock.calls
    .filter(([request]) => request === 'PATCH /items/{id}')
    .map(([, init]) => (init as { body: { categoryIds: string[] } }).body.categoryIds);

async function endBurst() {
  await act(() => vi.advanceTimersByTimeAsync(BURST_MS));
}

describe('useInstantCategories (D207)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    respond.mockReset();
    requests.mockReset();
  });
  afterEach(() => {
    const toast = currentToast();
    if (toast) dismissToast(toast.id);
    vi.useRealTimers();
  });

  it('is off for a new card', () => {
    const { result } = setup(null);
    expect(result.current).toBeNull();
  });

  it('saves a tap on its own and offers Undo', async () => {
    const item = makeItem({ categoryIds: ['a'] });
    echoPatch(item);
    const { result, onSaved } = setup(item);

    act(() => result.current!.change(['a', 'b']));
    expect(result.current!.selection).toEqual(['a', 'b']);
    await endBurst();

    expect(patchBodies()).toEqual([['a', 'b']]);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ categoryIds: ['a', 'b'] }));
    expect(currentToast()).toMatchObject({ message: CATEGORIES_SAVED, action: { label: 'Undo' } });

    act(() => currentToast()!.action!.onAction());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(patchBodies()).toEqual([['a', 'b'], ['a']]);
    expect(result.current!.selection).toEqual(['a']);
    expect(currentToast()).toMatchObject({ message: CATEGORIES_RESTORED });
    expect(currentToast()!.action).toBeUndefined();
  });

  it('reverts the chips and says so when the save fails', async () => {
    const item = makeItem({ categoryIds: ['a'] });
    respond.mockRejectedValue(new ApiError(500, null));
    const { result, onSaved } = setup(item);

    act(() => result.current!.change(['a', 'b']));
    await endBurst();

    expect(result.current!.selection).toEqual(['a']);
    expect(onSaved).not.toHaveBeenCalled();
    expect(currentToast()).toMatchObject({ message: CATEGORIES_FAILED });
  });

  it('says offline when the request never reached the server', async () => {
    const item = makeItem({ categoryIds: ['a'] });
    respond.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = setup(item);

    act(() => result.current!.change(['b']));
    await endBurst();

    expect(result.current!.selection).toEqual(['a']);
    expect(currentToast()).toMatchObject({ message: CATEGORIES_OFFLINE });
  });

  it('says so when Undo fails', async () => {
    const item = makeItem({ categoryIds: ['a'] });
    echoPatch(item);
    const { result } = setup(item);
    act(() => result.current!.change(['b']));
    await endBurst();

    respond.mockRejectedValue(new ApiError(500, null));
    act(() => currentToast()!.action!.onAction());
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current!.selection).toEqual(['b']);
    expect(currentToast()).toMatchObject({ message: UNDO_FAILED });
  });

  it("refuses to remove a published card's last category without a request (FR-008)", async () => {
    const item = makeItem({ status: 'published', categoryIds: ['a'] });
    const { result } = setup(item);

    act(() => result.current!.change([]));
    await endBurst();

    expect(result.current!.refusal).toBe(LAST_CATEGORY);
    expect(result.current!.selection).toEqual(['a']);
    expect(patchBodies()).toEqual([]);

    echoPatch(item);
    act(() => result.current!.change(['a', 'b']));
    expect(result.current!.refusal).toBeNull();
  });

  it('lets a proposal lose its last category', async () => {
    const item = makeItem({ status: 'proposed', categoryIds: ['a'] });
    echoPatch(item);
    const { result } = setup(item);

    act(() => result.current!.change([]));
    await endBurst();

    expect(result.current!.refusal).toBeNull();
    expect(patchBodies()).toEqual([[]]);
  });

  it('sends a pending burst when the editor closes (SC-004)', () => {
    const item = makeItem({ categoryIds: ['a'] });
    echoPatch(item);
    const { result, unmount } = setup(item);

    act(() => result.current!.change(['a', 'c']));
    unmount();

    expect(patchBodies()).toEqual([['a', 'c']]);
  });
});
