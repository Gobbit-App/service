import { useEffect, useRef } from 'react';

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

/** Hands an image pasted anywhere on the page to `onImage` while `enabled`. */
export function usePasteImage(onImage: (file: File) => void, enabled: boolean): void {
  const latest = useRef(onImage);
  useEffect(() => {
    latest.current = onImage;
  });
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (event: ClipboardEvent) => {
      const image = pastedImage(event);
      if (!image) return;
      event.preventDefault();
      latest.current(image);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [enabled]);
}
