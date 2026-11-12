import { useEffect, useRef, type RefObject } from 'react';

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

/**
 * The first image in a paste, or null when the paste isn't ours: another handler took it, there
 * is no image, or text is being pasted into a text field (copying from Word or a web page also
 * puts a picture on the clipboard).
 */
export function pastedImage(event: ClipboardEvent): File | null {
  const data = event.clipboardData;
  if (event.defaultPrevented || !data) return null;
  const image = Array.from(data.files).find((file) => file.type.startsWith('image/'));
  if (!image) return null;
  if (isTextField(event.target) && data.getData('text/plain') !== '') return null;
  return image;
}

export type PasteScope = HTMLElement | RefObject<HTMLElement | null> | null;

function scopeElement(scope: PasteScope | undefined): HTMLElement | null {
  if (!scope) return null;
  return scope instanceof HTMLElement ? scope : scope.current;
}

/**
 * Hands an image pasted anywhere on the page to `onImage` while `enabled`. With `scope`, only
 * pastes whose target is inside it are taken, in the capture phase so they win over page-wide
 * (unscoped) hooks, which see the paste as already handled.
 */
export function usePasteImage(
  onImage: (file: File) => void,
  enabled: boolean,
  scope?: PasteScope,
): void {
  const latest = useRef(onImage);
  useEffect(() => {
    latest.current = onImage;
  });
  useEffect(() => {
    if (!enabled) return;
    const scoped = scope !== undefined;
    const onPaste = (event: ClipboardEvent) => {
      if (scoped) {
        const root = scopeElement(scope);
        if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return;
      }
      const image = pastedImage(event);
      if (!image) return;
      event.preventDefault();
      latest.current(image);
    };
    document.addEventListener('paste', onPaste, scoped);
    return () => document.removeEventListener('paste', onPaste, scoped);
  }, [enabled, scope]);
}
