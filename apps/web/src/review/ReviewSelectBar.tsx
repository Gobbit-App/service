import type { ReactElement } from 'react';
import { BULK_PUBLISH_MAX } from '@pb/shared/ingest-constants';

/** D191: the queue's select mode toggle and, while selecting, select all and publish. */
export function ReviewSelectBar({
  selecting,
  selectedCount,
  shownCount,
  busy,
  onToggleMode,
  onSelectAll,
  onPublish,
}: {
  selecting: boolean;
  selectedCount: number;
  shownCount: number;
  busy: boolean;
  onToggleMode: () => void;
  onSelectAll: () => void;
  onPublish: () => void;
}): ReactElement {
  const tooMany = selectedCount > BULK_PUBLISH_MAX;
  return (
    <div className="review-select-bar" role="toolbar" aria-label="Select proposals">
      <button type="button" className="button button--ghost" onClick={onToggleMode}>
        {selecting ? 'Done selecting' : 'Select'}
      </button>
      {selecting && (
        <>
          <button
            type="button"
            className="button button--ghost"
            disabled={busy || selectedCount === shownCount}
            onClick={onSelectAll}
          >
            Select all shown
          </button>
          <button
            type="button"
            className="button"
            disabled={busy || selectedCount === 0 || tooMany}
            onClick={onPublish}
          >
            Publish selected ({selectedCount})
          </button>
          {tooMany && (
            <p className="review-select-bar__hint">Publish at most {BULK_PUBLISH_MAX} at a time.</p>
          )}
        </>
      )}
    </div>
  );
}
