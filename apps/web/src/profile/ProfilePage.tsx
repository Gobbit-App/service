import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { isNetworkError } from '../api/network-state';
import { meQuery } from '../api/queries';
import { useSignOut } from '../app/use-sign-out';
import { SettingsSection } from '../settings/SettingsSection';
import { Button } from '../ui/buttons/Button';
import { ErrorState, LoadingState } from '../ui/StatusViews';
import { ProfileForm } from './ProfileForm';

/** 046 (Story 1): Profile (sign-out lives here). Needs a connection to load and save. */
export function ProfilePage(): ReactElement {
  const me = useQuery(meQuery());
  const signOut = useSignOut();
  if (me.isPending) return <LoadingState label="Loading your profile…" />;
  if (!me.data) {
    return (
      <ErrorState
        message={
          isNetworkError(me.error)
            ? "You're offline. Your profile needs a connection."
            : "Couldn't load your profile."
        }
        onRetry={() => void me.refetch()}
      />
    );
  }
  return (
    <>
      <SettingsSection title="Profile">
        <ProfileForm
          userId={me.data.user.id}
          email={me.data.user.email}
          profile={me.data.profile}
        />
      </SettingsSection>
      <SettingsSection title="Account">
        <Button
          icon="sign-out"
          label="Sign out"
          variant="ghost"
          onClick={signOut.signOut}
          disabled={signOut.signingOut}
        />
      </SettingsSection>
    </>
  );
}
