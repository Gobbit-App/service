import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { isNetworkError } from '../api/network-state';
import { meQuery } from '../api/queries';
import { SettingsSection } from '../settings/SettingsSection';
import { ErrorState, LoadingState } from '../ui/StatusViews';
import { ProfileForm } from './ProfileForm';

/** 046 (Story 1): Settings → Profile. Needs a connection to load and save. */
export function ProfilePage(): ReactElement {
  const me = useQuery(meQuery());
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
    <SettingsSection title="Profile">
      <ProfileForm userId={me.data.user.id} email={me.data.user.email} profile={me.data.profile} />
    </SettingsSection>
  );
}
