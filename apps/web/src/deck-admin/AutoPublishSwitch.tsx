import { useId, type ReactElement } from 'react';

/**
 * D192: "Publish shares from publishers directly". Owners (and co-owners) flip it; everyone
 * else who can open deck settings sees its state. Held shares still go to review (D193).
 */
export function AutoPublishSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (autoPublishShares: boolean) => void;
}): ReactElement {
  const helpId = useId();
  return (
    <div className="admin-public">
      <label className="admin-public__switch">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-describedby={helpId}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        Publish shares from publishers directly
      </label>
      <p className="muted" id={helpId}>
        Shares from owners and maintainers become cards straight away. A share with no category, or
        one that looks like a card you already have, still goes to review.
      </p>
    </div>
  );
}
