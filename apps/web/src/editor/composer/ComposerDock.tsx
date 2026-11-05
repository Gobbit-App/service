import type { ReactElement } from 'react';
import { Button } from '../../ui/buttons/Button';

/**
 * D305 (039): the strip above the on-screen keyboard with a compact Save. Rendered only while the
 * keyboard is open; the CSS shows it on coarse-pointer screens below 768 px while a field has
 * focus, and moves the 038 formatting toolbar into the same strip while the body has focus.
 */
export function ComposerDock({
  saving,
  blockedReason,
  onBlockedSave,
}: {
  saving: boolean;
  blockedReason: string | null;
  onBlockedSave: () => void;
}): ReactElement {
  return (
    <div className="composer-dock">
      <Button
        type="submit"
        icon="check"
        label="Save"
        className="composer-dock__save"
        disabledReason={saving ? null : blockedReason}
        onBlockedClick={onBlockedSave}
        aria-busy={saving || undefined}
      />
    </div>
  );
}
