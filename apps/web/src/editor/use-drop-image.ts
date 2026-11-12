import { useEffect, useRef, useState, type RefObject } from 'react';

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Hands the first image dropped on the element to `onImage`. `dragging` is true while a file is
 * dragged over it, so the caller can show a drop target.
 */
export function useDropImage(
  ref: RefObject<HTMLElement | null>,
  onImage: (file: File) => void,
): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(onImage);
  useEffect(() => {
    latest.current = onImage;
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onEnterOrOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      // Moving between the element's own children also fires dragleave.
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      setDragging(false);
      if (!hasFiles(event)) return;
      event.preventDefault();
      const image = Array.from(event.dataTransfer?.files ?? []).find((file) =>
        file.type.startsWith('image/'),
      );
      if (image) latest.current(image);
    };
    element.addEventListener('dragenter', onEnterOrOver);
    element.addEventListener('dragover', onEnterOrOver);
    element.addEventListener('dragleave', onLeave);
    element.addEventListener('drop', onDrop);
    return () => {
      element.removeEventListener('dragenter', onEnterOrOver);
      element.removeEventListener('dragover', onEnterOrOver);
      element.removeEventListener('dragleave', onLeave);
      element.removeEventListener('drop', onDrop);
    };
  }, [ref]);
  return { dragging };
}
