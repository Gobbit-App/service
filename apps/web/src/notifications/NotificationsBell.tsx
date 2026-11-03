import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { bellState, pendingQuery } from '../api/pending';
import { IconLink } from '../ui/buttons/IconLink';
import './notifications.css';

export const NOTIFICATIONS_HREF = '/notifications';

/**
 * 037 (D298, contracts/web-ui.md): the bell in the bottom bar on every bar page. A light shows
 * while something waits on you (danger colour once one is overdue); no number, the accessible
 * name carries the counts.
 */
export function NotificationsBell(): ReactElement {
  const { light, label } = bellState(useQuery(pendingQuery()).data);
  return (
    <IconLink
      href={NOTIFICATIONS_HREF}
      icon="bell"
      label={label}
      tip="Notifications"
      className="notifications-bell"
    >
      {light !== 'none' && (
        <span
          className={`notifications-bell__light notifications-bell__light--${light}`}
          aria-hidden="true"
          data-light={light}
        />
      )}
    </IconLink>
  );
}
