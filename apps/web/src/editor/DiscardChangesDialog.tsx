import { useId, useRef, type ReactElement } from 'react';
import { Button } from '../ui/buttons/Button';
import { Sheet } from '../ui/sheet/Sheet';

/**
 * D202 / FR-006, FR-012: "Discard changes?" in the shared sheet (D304, 039): a native modal
 * dialog, so focus stays inside and the page behind is inert. Keep editing is focused on open;
 * Escape and the backdrop mean Keep editing; focus goes back to where it was. Mount it only while
 * asking.
 */
export function DiscardChangesDialog({
  onKeep,
  onDiscard,
}: {
  onKeep: () => void;
  onDiscard: () => void;
}): ReactElement {
  const keepRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Sheet labelledBy={titleId} describedBy={descriptionId} onClose={onKeep} initialFocus={keepRef}>
      <h2 id={titleId} className="sheet__title">
        Discard changes?
      </h2>
      <p id={descriptionId} className="sheet__text">
        Your changes to this card haven&apos;t been saved.
      </p>
      <div className="sheet__actions">
        <Button ref={keepRef} icon="edit" label="Keep editing" onClick={onKeep} />
        <Button icon="trash" label="Discard" variant="danger" onClick={onDiscard} />
      </div>
    </Sheet>
  );
}
