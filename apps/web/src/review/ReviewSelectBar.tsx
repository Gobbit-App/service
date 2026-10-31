import type { ReactElement } from 'react';
import { BULK_PUBLISH_MAX } from '@gobbit/shared/ingest-constants';
import { Button } from '../ui/buttons/Button';

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
      <Button
        icon={selecting ? 'check' : 'select'}
        label={selecting ? 'Done selecting' : 'Select'}
        variant="ghost"
        onClick={onToggleMode}
      />
      {selecting && (
        <>
          <Button
            icon="select"
            label="Select all shown"
            variant="ghost"
            disabled={busy || selectedCount === shownCount}
            onClick={onSelectAll}
          />
          <Button
            icon="check"
            label={`Publish selected (${selectedCount})`}
            disabled={busy || selectedCount === 0 || tooMany}
            onClick={onPublish}
          />
          {tooMany && (
            <p className="review-select-bar__hint">Publish at most {BULK_PUBLISH_MAX} at a time.</p>
          )}
        </>
      )}
    </div>
  );
}
