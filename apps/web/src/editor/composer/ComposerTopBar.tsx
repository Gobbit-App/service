import { useId, type ReactElement, type ReactNode } from 'react';
import { Button } from '../../ui/buttons/Button';
import { classNames } from '../../ui/buttons/button-props';
import { ComposerHeader } from './ComposerHeader';

export type ComposerTopBarProps = {
  heading: string;
  deckName: string;
  /** D200 back target: leaving goes through the unsaved-changes guard. */
  closeHref: string;
  saving: boolean;
  /** Why Save can't run (D308); null when it can. */
  blockedReason: string | null;
  /** Show the reason as a line under the bar (after a change or a Save attempt). */
  showReason: boolean;
  /** A click on the blocked Save: reveal and focus what to fix. */
  onBlockedSave: () => void;
  /** Extra controls before Save (the narrow-screen Preview toggle). */
  actions?: ReactNode;
};

/**
 * D300 / D308 (039): the composer's own top bar, in place of the app header. Close (a link, so
 * the leave guard decides), the heading with the deck under it, and Save as the form's submit.
 * Save keeps its name while saving (busy + a progress line) and stays focusable while blocked.
 */
export function ComposerTopBar({
  heading,
  deckName,
  closeHref,
  saving,
  blockedReason,
  showReason,
  onBlockedSave,
  actions,
}: ComposerTopBarProps): ReactElement {
  const reasonId = useId();
  const blocked = saving ? null : blockedReason;
  return (
    <ComposerHeader
      heading={heading}
      deckName={deckName}
      closeHref={closeHref}
      busy={saving}
      actions={
        <>
          {actions}
          <Button
            type="submit"
            icon="check"
            label="Save"
            className="composer-bar__save"
            disabledReason={blocked}
            onBlockedClick={onBlockedSave}
            aria-describedby={blocked ? reasonId : undefined}
            aria-busy={saving || undefined}
          />
        </>
      }
      below={
        <>
          {blocked && (
            <p
              id={reasonId}
              className={classNames('composer-bar__reason', !showReason && 'visually-hidden')}
            >
              {blocked}
            </p>
          )}
          {saving && <span className="composer-bar__progress" aria-hidden="true" />}
        </>
      }
    />
  );
}
