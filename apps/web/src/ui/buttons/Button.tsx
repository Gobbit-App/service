import type { ButtonHTMLAttributes, ReactElement, Ref } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { classNames, guardClick, tipText } from './button-props';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'button',
  ghost: 'button button--ghost',
  danger: 'button button--danger',
};

/** `aria-label` is allowed for a name that says more than the visible label (e.g. "Revoke Phone"). */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Visible label (hidden below 480 px) and the accessible name unless `aria-label` is given. */
  label: string;
  variant?: ButtonVariant;
  disabledReason?: string | null;
  ref?: Ref<HTMLButtonElement>;
}

/** D211: an icon + label button; the label collapses to icon-only on narrow screens (FR-005). */
export function Button({
  icon,
  label,
  variant = 'primary',
  disabledReason,
  className,
  onClick,
  type = 'button',
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      {...rest}
      type={type}
      className={classNames(VARIANT_CLASS[variant], 'button--icon', className)}
      aria-disabled={disabledReason ? true : undefined}
      data-tip={tipText(label, undefined, disabledReason)}
      onClick={guardClick(disabledReason, onClick)}
    >
      <Icon name={icon} />
      <span className="button__label">{label}</span>
    </button>
  );
}
