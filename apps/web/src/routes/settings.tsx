import { createFileRoute } from '@tanstack/react-router';
import { AppHeader } from '../app/AppHeader';
import { SettingsScreen } from '../settings/SettingsScreen';

/** D99: ingest tokens, the iPhone Shortcut link and the email-in address. */
export const Route = createFileRoute('/settings')({
  component: Settings,
});

function Settings() {
  return (
    <>
      <AppHeader title="Settings" />
      <main className="page">
        <SettingsScreen />
      </main>
    </>
  );
}
