import type { ButtonHTMLAttributes, ReactElement, Ref } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { classNames, guardClick, tipText } from './button-props';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label' | 'aria-pressed'
> {
  icon: IconName;
  /** Accessible name (and default tooltip). */
  label: string;
  /** Tooltip text when it should say more than the name. */
  tip?: string;
  /** Toggle state; a fillable icon is drawn filled while pressed. */
  pressed?: boolean;
  tone?: 'danger';
  /** Why the action can't run now: `aria-disabled`, focusable, click ignored. */
  disabledReason?: string | null;
  ref?: Ref<HTMLButtonElement>;
}

/** D211: an icon-only button with a 44 px hit area, an accessible name and a tooltip. */
export function IconButton({
  icon,
  label,
  tip,
  pressed,
  tone,
  disabledReason,
  className,
  onClick,
  type = 'button',
  ...rest
}: IconButtonProps): ReactElement {
  return (
    <button
      {...rest}
      type={type}
      className={classNames('icon-button', tone === 'danger' && 'icon-button--danger', className)}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={disabledReason ? true : undefined}
      data-tip={tipText(label, tip, disabledReason)}
      onClick={guardClick(disabledReason, onClick)}
    >
      <Icon name={icon} filled={pressed} />
    </button>
  );
}
