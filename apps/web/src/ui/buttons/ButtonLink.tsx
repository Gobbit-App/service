import type { ReactElement } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { NavLink } from '../NavLink';
import { classNames } from './button-props';

/**
 * D211: an in-app link styled as a labelled button (icon + label, label hidden below 480 px).
 * `document` links leave the SPA with a normal page load (e.g. the API-rendered `/welcome`, D226).
 */
export function ButtonLink({
  href,
  icon,
  label,
  variant = 'primary',
  className,
  document = false,
}: {
  href: string;
  icon: IconName;
  label: string;
  variant?: 'primary' | 'ghost';
  className?: string;
  document?: boolean;
}): ReactElement {
  const classes = classNames(
    'button button--icon',
    variant === 'ghost' && 'button--ghost',
    className,
  );
  const content = (
    <>
      <Icon name={icon} />
      <span className="button__label">{label}</span>
    </>
  );
  if (document) {
    return (
      <a href={href} className={classes} data-tip={label}>
        {content}
      </a>
    );
  }
  return (
    <NavLink href={href} className={classes} tip={label}>
      {content}
    </NavLink>
  );
}
