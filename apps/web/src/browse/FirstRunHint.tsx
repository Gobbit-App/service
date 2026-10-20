import { useEffect, useId, useRef, type KeyboardEvent, type ReactElement } from 'react';

/** FR-012: the one-time overlay naming the three zones. Dismiss only (contract §4). */
export function FirstRunHint({ onDismiss }: { onDismiss: () => void }): ReactElement {
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    button.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    } else if (event.key === 'Tab') {
      // The only control: keep focus inside the dialog.
      event.preventDefault();
      button.current?.focus();
    }
  };

  return (
    <div
      className="browse-hint"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <div className="browse-hint__zone browse-hint__zone--header">
        <p>Swipe sideways here to change category</p>
      </div>
      <div className="browse-hint__zone browse-hint__zone--middle">
        <h2 id={titleId}>How to browse</h2>
        <p>Swipe up or down for the next or previous card</p>
        <button ref={button} type="button" className="button" onClick={onDismiss}>
          Got it
        </button>
      </div>
      <div className="browse-hint__zone browse-hint__zone--footer">
        <p>Swipe sideways here for details and source</p>
      </div>
    </div>
  );
}
