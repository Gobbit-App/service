import { useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import { meQuery } from '../api/queries';
import { NavLink, useNavigateHref } from '../ui/NavLink';

/**
 * Top bar of signed-in pages: home link, page title, page actions (e.g. the review pill) and
 * sign-out (D66: `/me` runs on boot).
 */
export function AppHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}): ReactElement {
  const me = useQuery(meQuery());
  const { signOut } = useRouteContext({ from: '__root__' });
  const navigate = useNavigateHref();
  const [signingOut, setSigningOut] = useState(false);

  /** Leave the private page first, so queries cleared by sign-out can't trigger a 401 redirect. */
  const handleSignOut = () => {
    setSigningOut(true);
    navigate('/sign-in');
    void signOut();
  };

  return (
    <header className="app-header">
      <NavLink href="/?all=true" className="app-header__home">
        <span aria-hidden="true">◂</span>
        <span className="visually-hidden">All pocketbooks</span>
      </NavLink>
      <h1 className="app-header__title" dir="auto">
        {title}
      </h1>
      {actions}
      <NavLink href="/settings" className="icon-button app-header__settings">
        <span aria-hidden="true">⚙</span>
        <span className="visually-hidden">Settings</span>
      </NavLink>
      <button
        type="button"
        className="button button--ghost app-header__sign-out"
        onClick={handleSignOut}
        disabled={signingOut}
        title={me.data ? `Signed in as ${me.data.user.email}` : undefined}
      >
        Sign out
      </button>
    </header>
  );
}
