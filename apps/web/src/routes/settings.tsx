import { createFileRoute } from '@tanstack/react-router';
import { AppHeader } from '../app/AppHeader';
import { backTarget } from '../app/back-target';
import { SettingsScreen } from '../settings/SettingsScreen';

/** D99/D104: ingest tokens and the ways to use them (Shortcut, email-in, HTTP). */
export const Route = createFileRoute('/settings')({
  component: Settings,
});

function Settings() {
  return (
    <>
      <AppHeader title="Settings" back={backTarget({ kind: 'top' })} />
      <main className="page">
        <SettingsScreen />
      </main>
    </>
  );
}
