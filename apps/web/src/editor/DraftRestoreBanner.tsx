import type { ReactElement } from 'react';

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
        <button type="button" className="button" onClick={onRestore}>
          Restore
        </button>
        <button type="button" className="button button--ghost" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}
