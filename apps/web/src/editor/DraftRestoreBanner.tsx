import type { ReactElement } from 'react';
import { Button } from '../ui/buttons/Button';

/** D145: the offer to bring back an unsaved draft (contracts/editor-ui.md). */
export function DraftRestoreBanner({
  stale,
  onRestore,
  onDiscard,
}: {
  stale: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}): ReactElement {
  return (
    <div className="draft-restore" role="status">
      <p className="draft-restore__title">Restore unsaved draft?</p>
      {stale && (
        <p className="draft-restore__warning">
          This card has changed since — restoring will overwrite those changes when you save.
        </p>
      )}
      <div className="draft-restore__actions">
        <Button icon="restore" label="Restore" onClick={onRestore} />
        <Button icon="trash" label="Discard" variant="ghost" onClick={onDiscard} />
      </div>
    </div>
  );
}
