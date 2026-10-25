import { useEffect, useId, useRef, type ReactElement, type SyntheticEvent } from 'react';

/**
 * D202 / FR-006, FR-012: "Discard changes?" as a native modal dialog (focus stays inside, the
 * page behind is inert). Keep editing is focused on open; Escape is Keep editing; focus goes
 * back to where it was. Mount it only while asking.
 */
export function DiscardChangesDialog({
  onKeep,
  onDiscard,
}: {
  onKeep: () => void;
  onDiscard: () => void;
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // jsdom has no showModal; browsers all do (the PWA's targets).
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    keepRef.current?.focus();
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onKeep();
  };

  return (
    <dialog
      ref={ref}
      className="discard-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={onCancel}
    >
      <h2 id={titleId} className="discard-dialog__title">
        Discard changes?
      </h2>
      <p id={descriptionId}>Your changes to this card haven&apos;t been saved.</p>
      <div className="discard-dialog__buttons">
        <button ref={keepRef} type="button" className="button" onClick={onKeep}>
          Keep editing
        </button>
        <button type="button" className="button button--ghost" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </dialog>
  );
}
