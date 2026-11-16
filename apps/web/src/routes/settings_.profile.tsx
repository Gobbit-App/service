import { createFileRoute } from '@tanstack/react-router';
import { AppHeader } from '../app/AppHeader';
import { BottomBar } from '../app/BottomBar';
import { ProfilePage } from '../profile/ProfilePage';

/** 046: the member's profile (`/settings/profile`); lazy via autoCodeSplitting. `settings_` keeps it out of the Settings layout (which has no Outlet). */
export const Route = createFileRoute('/settings_/profile')({
  component: Profile,
});

function Profile() {
  return (
    <>
      <AppHeader title="Profile" back="/settings" />
      <main className="page">
        <ProfilePage />
      </main>
      <BottomBar />
    </>
  );
}
