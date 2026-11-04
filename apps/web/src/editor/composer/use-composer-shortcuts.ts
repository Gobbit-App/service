import { useEffect, useRef, type RefObject } from 'react';

export type ComposerKey = 'submit' | 'escape' | null;

type KeyLike = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'defaultPrevented' | 'isComposing'
>;

/**
 * D310: what a key press means to the composer. Nothing while an IME is composing, after another
 * handler took the key (a panel's Escape), or while a modal sheet is open (it owns its keys).
 */
export function composerKey(event: KeyLike, dialogOpen: boolean): ComposerKey {
  if (event.defaultPrevented || event.isComposing || dialogOpen) return null;
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey) return 'submit';
  if (
    event.key === 'Escape' &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  ) {
    return 'escape';
  }
  return null;
}

function hasOpenDialog(): boolean {
  return document.querySelector('dialog[open]') !== null;
}

/**
 * D310: Ctrl/Cmd+Enter saves (the same path as the Save button, so a blocked Save explains itself)
 * and Escape steps back (`onEscape`: close the preview, else leave through the guard). A
 * bubble-phase document listener, so field-level handlers get the key first.
 */
export function useComposerShortcuts({
  formRef,
  onEscape,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  onEscape: () => void;
}): void {
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = composerKey(event, hasOpenDialog());
      if (action === 'submit') {
        const form = formRef.current;
        if (!form) return;
        event.preventDefault();
        form.requestSubmit();
      } else if (action === 'escape') {
        event.preventDefault();
        escape.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [formRef]);
}
