import { useId, useRef, type ReactElement } from 'react';
import { Button } from '../ui/buttons/Button';
import { Sheet } from '../ui/sheet/Sheet';

/** D191: confirm discarding every still-proposed card of one import; Cancel is the safe default. */
export function DiscardImportSheet({
  source,
  busy,
  onCancel,
  onConfirm,
}: {
  source: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();
  return (
    <Sheet labelledBy={titleId} describedBy={textId} onClose={onCancel} initialFocus={cancelRef}>
      <h2 id={titleId} className="sheet__title">
        Discard this import?
      </h2>
      <p id={textId} className="sheet__text">
        Every card still waiting from <span dir="auto">“{source}”</span> will be discarded.
      </p>
      <div className="sheet__actions">
        <Button ref={cancelRef} icon="undo" label="Cancel" onClick={onCancel} />
        <Button
          icon="trash"
          label="Discard all"
          variant="danger"
          disabled={busy}
          onClick={onConfirm}
        />
      </div>
    </Sheet>
  );
}
