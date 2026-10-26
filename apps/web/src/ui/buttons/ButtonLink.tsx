import type { ReactElement } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { NavLink } from '../NavLink';
import { classNames } from './button-props';

/** D211: an in-app link styled as a labelled button (icon + label, label hidden below 480 px). */
export function ButtonLink({
  href,
  icon,
  label,
  variant = 'primary',
  className,
}: {
  href: string;
  icon: IconName;
  label: string;
  variant?: 'primary' | 'ghost';
  className?: string;
}): ReactElement {
  return (
    <NavLink
      href={href}
      className={classNames(
        'button button--icon',
        variant === 'ghost' && 'button--ghost',
        className,
      )}
      tip={label}
    >
      <Icon name={icon} />
      <span className="button__label">{label}</span>
    </NavLink>
  );
}
