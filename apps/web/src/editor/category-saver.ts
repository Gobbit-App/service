import { sameIds } from './equal';

/** D207: taps closer together than this are one save (one request, one activity-log line). */
export const BURST_MS = 600;

export type SaveKind = 'saved' | 'restored';

export type CategorySaverOptions<T extends { categoryIds: string[] }> = {
  /** The card's categories when the editor opened. */
  initial: readonly string[];
  /** Sends `PATCH /items/{id} { categoryIds }`; resolves with the saved card. */
  save: (ids: string[]) => Promise<T>;
  /** The chips to show (a tap, a revert after a failure, the saved set). */
  onSelection: (ids: string[]) => void;
  /** A burst (or an Undo) is saved; `undoTarget` is the set before the burst. */
  onSaved: (saved: T, kind: SaveKind, undoTarget: string[]) => void;
  /** A save failed; the chips are already back on the last saved set. */
  onError: (error: unknown, kind: SaveKind) => void;
};

export type CategorySaver = {
  change: (ids: readonly string[]) => void;
  /** Saves `ids` (the set before a burst) at once, cancelling any pending burst. */
  undo: (ids: readonly string[]) => void;
  /** Sends a pending burst now (leaving the editor). */
  flush: () => void;
  /** Flushes and stops the timer; an in-flight request still completes. */
  dispose: () => void;
  selection: () => string[];
};

/**
 * D207: the instant category-save controller for an existing card, free of React so its timing
 * is unit-tested with fake timers. Saves are serialised; a failure reverts to the last saved set.
 */
export function createCategorySaver<T extends { categoryIds: string[] }>(
  options: CategorySaverOptions<T>,
): CategorySaver {
  let confirmed = [...options.initial];
  let selection = [...options.initial];
  /** The confirmed set when the current burst began; null when no burst is open. */
  let burstStart: string[] | null = null;
  let kind: SaveKind = 'saved';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  /** The timer fired during a request: send again when it settles. */
  let sendAfter = false;

  const show = (ids: string[]) => {
    selection = ids;
    options.onSelection([...ids]);
  };

  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  function fire(): void {
    stopTimer();
    if (inFlight) {
      sendAfter = true;
      return;
    }
    void send();
  }

  async function send(): Promise<void> {
    if (sameIds(selection, confirmed)) {
      burstStart = null;
      return;
    }
    const ids = [...selection];
    const sentKind = kind;
    inFlight = true;
    let saved: T;
    try {
      saved = await options.save(ids);
    } catch (error) {
      inFlight = false;
      sendAfter = false;
      stopTimer();
      burstStart = null;
      show([...confirmed]);
      options.onError(error, sentKind);
      return;
    }
    inFlight = false;
    confirmed = [...saved.categoryIds];
    if (sendAfter) {
      sendAfter = false;
      if (!sameIds(selection, confirmed)) {
        void send();
        return;
      }
    }
    if (timer !== undefined) return; // more taps are waiting for their burst to end
    const undoTarget = burstStart ?? [...ids];
    burstStart = null;
    if (sameIds(selection, confirmed)) selection = [...confirmed];
    options.onSaved(saved, sentKind, undoTarget);
  }

  return {
    change(ids) {
      burstStart ??= [...confirmed];
      kind = 'saved';
      show([...ids]);
      stopTimer();
      timer = setTimeout(fire, BURST_MS);
    },
    undo(ids) {
      stopTimer();
      burstStart = [...confirmed];
      kind = 'restored';
      show([...ids]);
      fire();
    },
    flush() {
      if (timer !== undefined) fire();
    },
    dispose() {
      if (timer !== undefined) fire();
    },
    selection: () => [...selection],
  };
}
