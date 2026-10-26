import type { ReactElement, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { isPlainClick, useNavigateHref } from '../NavLink';
import { classNames, tipText } from './button-props';

/**
 * D211: an in-app link drawn as an icon (a real anchor: new tab and copy link keep working).
 * `children` (e.g. a count badge) render after the icon.
 */
export function IconLink({
  href,
  icon,
  label,
  tip,
  className,
  children,
}: {
  href: string;
  icon: IconName;
  label: string;
  tip?: string;
  className?: string;
  children?: ReactNode;
}): ReactElement {
  const navigate = useNavigateHref();
  return (
    <a
      href={href}
      className={classNames('icon-button', className)}
      aria-label={label}
      data-tip={tipText(label, tip)}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        navigate(href);
      }}
    >
      <Icon name={icon} />
      {children}
    </a>
  );
}
