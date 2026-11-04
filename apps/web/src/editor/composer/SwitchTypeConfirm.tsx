import { useId, useRef, type ReactElement } from 'react';
import type { ItemType } from '@gobbit/shared';
import { Button } from '../../ui/buttons/Button';
import { Sheet } from '../../ui/sheet/Sheet';
import { TYPE_LABELS } from './type-tiles';

/** D303: switching would drop the current type's content, so ask; Keep is the safe default. */
export function SwitchTypeConfirm({
  from,
  to,
  onKeep,
  onSwitch,
}: {
  from: ItemType;
  to: ItemType;
  onKeep: () => void;
  onSwitch: () => void;
}): ReactElement {
  const keepRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const textId = useId();
  const current = TYPE_LABELS[from];
  return (
    <Sheet labelledBy={titleId} describedBy={textId} onClose={onKeep} initialFocus={keepRef}>
      <h2 id={titleId} className="sheet__title">
        Switch to {TYPE_LABELS[to]}?
      </h2>
      <p id={textId} className="sheet__text">
        Your {current.toLowerCase()} content will be removed. The title, text and categories stay.
      </p>
      <div className="sheet__actions">
        <Button ref={keepRef} icon="undo" label={`Keep ${current}`} onClick={onKeep} />
        <Button icon="check" label="Switch" variant="danger" onClick={onSwitch} />
      </div>
    </Sheet>
  );
}
