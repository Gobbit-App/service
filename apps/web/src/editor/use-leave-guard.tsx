import { useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { DiscardChangesDialog } from './DiscardChangesDialog';

export type LeaveGuardOptions = {
  /** Guard only while there is unsaved work; off = no prompt and no `beforeunload`. */
  when: boolean;
  /** Runs when a navigation is held (e.g. write the draft now, D204). */
  onAttempt?: () => void;
  /** Runs before the held navigation continues after Discard (e.g. remove the draft). */
  onDiscard?: () => Promise<void> | void;
};

/**
 * D201 / FR-006, FR-007: holds every in-app navigation (links, header back, browser and
 * gesture back) while `when` is true and asks "Discard changes?"; the browser's own prompt
 * covers reload and close. Returns the dialog to render (null while not asking).
 */
export function useLeaveGuard({
  when,
  onAttempt,
  onDiscard,
}: LeaveGuardOptions): ReactElement | null {
  const callbacks = useRef({ onAttempt, onDiscard });
  useEffect(() => {
    callbacks.current = { onAttempt, onDiscard };
  });
  const [discarding, setDiscarding] = useState(false);

  // Stable, so the router keeps one blocker registered while `when` holds.
  const shouldBlockFn = useCallback(() => {
    callbacks.current.onAttempt?.();
    return true;
  }, []);
  const blocker = useBlocker({
    shouldBlockFn,
    withResolver: true,
    enableBeforeUnload: true,
    disabled: !when,
  });

  if (blocker.status !== 'blocked') return null;

  const discard = async () => {
    if (discarding) return;
    setDiscarding(true);
    try {
      await callbacks.current.onDiscard?.();
    } catch (error) {
      // Leaving must still work; a draft left behind is offered again next time.
      console.error('[editor] could not remove the draft before leaving', error);
    } finally {
      setDiscarding(false);
      blocker.proceed();
    }
  };

  return <DiscardChangesDialog onKeep={blocker.reset} onDiscard={() => void discard()} />;
}
