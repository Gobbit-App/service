import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigateHref } from '../ui/NavLink';
import { onArrival } from './on-arrival';

/**
 * D276: sign-out from the bottom bar's ⋯ menu. Leave the private page first, so queries cleared
 * by sign-out can't trigger a 401 redirect; sign out only once the page was left (022: an editor
 * with unsaved changes may hold it).
 */
export function useSignOut(): { signOut: () => void; signingOut: boolean } {
  const { signOut } = useRouteContext({ from: '__root__' });
  const navigate = useNavigateHref();
  const { history } = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const cancelPending = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPending.current?.(), []);

  const leaveAndSignOut = useCallback(() => {
    cancelPending.current?.();
    cancelPending.current = onArrival(history, '/sign-in', () => {
      setSigningOut(true);
      void signOut();
    });
    navigate('/sign-in');
  }, [history, navigate, signOut]);

  return { signOut: leaveAndSignOut, signingOut };
}
