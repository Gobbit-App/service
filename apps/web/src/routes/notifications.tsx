import { createFileRoute } from '@tanstack/react-router';
import { AppHeader } from '../app/AppHeader';
import { backTarget } from '../app/back-target';
import { BottomBar } from '../app/BottomBar';
import { readLastDeck } from '../lib/last-deck';
import { NotificationsScreen } from '../notifications/NotificationsScreen';

/** 037 (D298): what is waiting on you across your decks; the bottom bar's bell opens it. */
export const Route = createFileRoute('/notifications')({
  component: Notifications,
});

function Notifications() {
  return (
    <>
      <AppHeader
        title="Notifications"
        back={backTarget({ kind: 'top', lastDeck: readLastDeck() })}
      />
      <main className="page">
        <NotificationsScreen />
      </main>
      <BottomBar />
    </>
  );
}
