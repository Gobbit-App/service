import { useEffect, useId, useRef, type KeyboardEvent, type ReactElement } from 'react';
import { Button } from '../ui/buttons/Button';

/** The three tips of the first-run sheet (034). */
export const HINT_TIPS = [
  'Swipe sideways to flip through cards',
  'Scroll down for details and source',
  'Tap a category at the top to switch',
] as const;

/** FR-010: a one-time bottom sheet with the three moves. Dismiss only. */
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
    <div className="browse-hint" onKeyDown={onKeyDown}>
      <div className="browse-hint__sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 className="browse-hint__title" id={titleId}>
          How to browse
        </h2>
        <ol className="browse-hint__tips">
          {HINT_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ol>
        <Button
          ref={button}
          icon="check"
          label="Got it"
          className="browse-hint__ok"
          onClick={onDismiss}
        />
      </div>
    </div>
  );
}
