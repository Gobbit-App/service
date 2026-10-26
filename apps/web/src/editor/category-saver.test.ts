import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BURST_MS, createCategorySaver, type CategorySaverOptions } from './category-saver';

type Saved = { categoryIds: string[] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<CategorySaverOptions<Saved>> = {}) {
  const save = vi.fn(async (ids: string[]): Promise<Saved> => ({ categoryIds: ids }));
  const onSelection = vi.fn();
  const onSaved = vi.fn();
  const onError = vi.fn();
  const saver = createCategorySaver<Saved>({
    initial: ['a'],
    save,
    onSelection,
    onSaved,
    onError,
    ...overrides,
  });
  return { saver, save, onSelection, onSaved, onError };
}

/** Lets the timer fire and the save promise settle. */
async function settle(ms = BURST_MS) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('createCategorySaver (D207)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows each tap at once and saves a burst of taps once', async () => {
    const { saver, save, onSelection, onSaved } = setup();
    saver.change(['a', 'b']);
    await settle(BURST_MS - 100);
    saver.change(['b']);
    await settle(BURST_MS - 100);
    saver.change(['b', 'c']);
    expect(onSelection).toHaveBeenLastCalledWith(['b', 'c']);
    expect(save).not.toHaveBeenCalled();

    await settle();
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(['b', 'c']);
    expect(onSaved).toHaveBeenCalledWith({ categoryIds: ['b', 'c'] }, 'saved', ['a']);
  });

  it('sends nothing when a burst ends back on the saved set', async () => {
    const { saver, save, onSaved } = setup();
    saver.change(['a', 'b']);
    saver.change(['a']);
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('serialises saves: a burst ending during a request is sent after it', async () => {
    const first = deferred<Saved>();
    const save = vi
      .fn<(ids: string[]) => Promise<Saved>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (ids) => ({ categoryIds: ids }));
    const { saver, onSaved } = setup({ save });
    saver.change(['a', 'b']);
    await settle();
    saver.change(['a', 'b', 'c']);
    await settle();
    expect(save).toHaveBeenCalledOnce();

    first.resolve({ categoryIds: ['a', 'b'] });
    await settle(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(['a', 'b', 'c']);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onSaved).toHaveBeenCalledWith({ categoryIds: ['a', 'b', 'c'] }, 'saved', ['a']);
  });

  it('waits for a still-open burst before reporting a save', async () => {
    const first = deferred<Saved>();
    const save = vi
      .fn<(ids: string[]) => Promise<Saved>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (ids) => ({ categoryIds: ids }));
    const { saver, onSaved } = setup({ save });
    saver.change(['b']);
    await settle();
    saver.change(['c']);
    first.resolve({ categoryIds: ['b'] });
    await settle(0);
    expect(onSaved).not.toHaveBeenCalled();
    await settle();
    expect(save).toHaveBeenLastCalledWith(['c']);
    expect(onSaved).toHaveBeenCalledWith({ categoryIds: ['c'] }, 'saved', ['a']);
  });

  it('undo saves the set before the burst at once and reports it as restored', async () => {
    const { saver, save, onSaved, onSelection } = setup();
    saver.change(['b']);
    await settle();
    const undoTarget = onSaved.mock.calls[0]![2] as string[];

    saver.undo(undoTarget);
    expect(onSelection).toHaveBeenLastCalledWith(['a']);
    await settle(0);
    expect(save).toHaveBeenLastCalledWith(['a']);
    expect(onSaved).toHaveBeenLastCalledWith({ categoryIds: ['a'] }, 'restored', ['b']);
  });

  it('undo cancels a pending burst', async () => {
    const { saver, save } = setup();
    saver.change(['b']);
    await settle();
    saver.change(['b', 'c']);
    saver.undo(['a']);
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(['a']);
  });

  it('reverts the chips to the saved set and reports a failure', async () => {
    const error = new Error('boom');
    const save = vi.fn(async () => {
      throw error;
    });
    const { saver, onSelection, onError, onSaved } = setup({ save });
    saver.change(['a', 'b']);
    await settle();
    expect(onSelection).toHaveBeenLastCalledWith(['a']);
    expect(onError).toHaveBeenCalledWith(error, 'saved');
    expect(onSaved).not.toHaveBeenCalled();
    expect(saver.selection()).toEqual(['a']);
  });

  it('keeps the server set as saved (hidden or reordered categories)', async () => {
    const save = vi.fn(async () => ({ categoryIds: ['c', 'b'] }));
    const { saver, onSaved } = setup({ save });
    saver.change(['b', 'c']);
    await settle();
    expect(onSaved.mock.calls[0]![0]).toEqual({ categoryIds: ['c', 'b'] });
    saver.change(['c', 'b']);
    await settle();
    expect(save).toHaveBeenCalledOnce();
  });

  it('flush sends a pending burst immediately', async () => {
    const { saver, save } = setup();
    saver.change(['b']);
    saver.flush();
    expect(save).toHaveBeenCalledWith(['b']);
    saver.flush();
    expect(save).toHaveBeenCalledOnce();
  });

  it('dispose sends what is pending and leaves no timer behind', async () => {
    const { saver, save } = setup();
    saver.change(['b']);
    saver.dispose();
    expect(save).toHaveBeenCalledOnce();
    await settle();
    expect(save).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
