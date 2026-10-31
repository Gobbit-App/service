import { useId, type ReactElement } from 'react';
import type { Category } from '@gobbit/shared';
import { Button } from '../ui/buttons/Button';

/**
 * D184: confirmation before a deck goes public. Names what anyone will see (the public
 * categories) and where (the public address); with no public category it warns that the page
 * will be empty.
 */
export function PublicSwitchDialog({
  categories,
  publicUrl,
  pending,
  onConfirm,
  onCancel,
}: {
  categories: readonly Category[];
  publicUrl: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactElement {
  const titleId = useId();
  const shown = categories.filter((c) => c.visibility === 'public');

  return (
    <div className="admin-confirm" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <h3 id={titleId}>Make this deck public?</h3>
      {shown.length > 0 ? (
        <>
          <p>Anyone with the link will see the published cards in:</p>
          <ul className="admin-confirm__list">
            {shown.map((c) => (
              <li key={c.id} dir="auto">
                {c.name}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="admin-confirm__warning">
          No category is set to Everyone yet, so the public page will be empty until you choose one.
        </p>
      )}
      <p>
        Public address: <code>{publicUrl}</code>
      </p>
      <p className="muted">Admins-only and members-only categories stay private.</p>
      <div className="admin-confirm__actions">
        <Button icon="eye" label="Make public" disabled={pending} onClick={onConfirm} />
        <Button icon="close" label="Cancel" variant="ghost" onClick={onCancel} />
      </div>
    </div>
  );
}
