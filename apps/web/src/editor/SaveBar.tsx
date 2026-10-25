import { useId, type ReactElement } from 'react';

export function saveBlockedReason(errorCount: number, calcReady: boolean): string | null {
  if (errorCount > 0) return errorCount === 1 ? 'Fix 1 field' : `Fix ${errorCount} fields`;
  if (!calcReady) return 'Loading the calculator…';
  return null;
}

/**
 * Save button with the reason it is disabled next to it, a form-level save error and Cancel
 * (FR-004: never disabled; leaving goes through the unsaved-changes guard).
 */
export function SaveBar({
  blockedReason,
  saving,
  formError,
  onCancel,
}: {
  blockedReason: string | null;
  saving: boolean;
  formError: string | null;
  onCancel: () => void;
}): ReactElement {
  const reasonId = useId();
  return (
    <div className="editor__save">
      {formError && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      <div className="editor__save-row">
        <button
          type="submit"
          className="button"
          disabled={blockedReason !== null || saving}
          aria-describedby={blockedReason ? reasonId : undefined}
          aria-busy={saving || undefined}
        >
          Save card
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancel
        </button>
        {blockedReason && (
          <span id={reasonId} className="editor__save-reason">
            {blockedReason}
          </span>
        )}
      </div>
    </div>
  );
}
