import { useQuery } from '@tanstack/react-query';
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { meQuery } from '../api/queries';
import { IconButton } from '../ui/buttons/IconButton';
import { IconLink } from '../ui/buttons/IconLink';
import { useNavigateHref } from '../ui/NavLink';
import { onArrival } from './on-arrival';

/**
 * Top bar of signed-in pages: back control, page title, page actions (e.g. the review pill)
 * and sign-out (D66: `/me` runs on boot).
 */
export function AppHeader({
  title,
  back,
  actions,
}: {
  title: string;
  /** D200: one level up (`backTarget(screen)`); null on the deck list = no control. */
  back: string | null;
  actions?: ReactNode;
}): ReactElement {
  const me = useQuery(meQuery());
  const { signOut } = useRouteContext({ from: '__root__' });
  const navigate = useNavigateHref();
  const { history } = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const cancelPending = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPending.current?.(), []);

  /**
   * Leave the private page first, so queries cleared by sign-out can't trigger a 401 redirect;
   * sign out only once the page was left (022: an editor with unsaved changes may hold it).
   */
  const handleSignOut = () => {
    cancelPending.current?.();
    cancelPending.current = onArrival(history, '/sign-in', () => {
      setSigningOut(true);
      void signOut();
    });
    navigate('/sign-in');
  };

  return (
    <header className="app-header">
      {back === null ? (
        <span className="app-header__back app-header__back--none" aria-hidden="true" />
      ) : (
        <IconLink href={back} icon="back" label="Back" className="app-header__back" />
      )}
      <h1 className="app-header__title" dir="auto">
        {title}
      </h1>
      {actions}
      <IconLink
        href="/settings"
        icon="settings"
        label="Settings"
        className="app-header__settings"
      />
      <IconButton
        icon="sign-out"
        label="Sign out"
        tip={me.data ? `Sign out (${me.data.user.email})` : undefined}
        className="app-header__sign-out"
        onClick={handleSignOut}
        disabled={signingOut}
      />
    </header>
  );
}
