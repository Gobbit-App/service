import { useEffect, useRef, type RefObject } from 'react';

const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

/** Hands the first image dropped on `target` to `onImage`; other drops are ignored. */
export function useDropImage(
  target: RefObject<HTMLElement | null>,
  onImage: (file: File) => void,
): void {
  const latest = useRef(onImage);
  useEffect(() => {
    latest.current = onImage;
  });
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    // preventDefault on dragover allows the drop; on drop it stops the browser opening the file
    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      const image = Array.from(event.dataTransfer?.files ?? []).find((f) =>
        f.type.startsWith('image/'),
      );
      if (image) latest.current(image);
    };
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    };
  }, [target]);
}
