import { createFileRoute } from '@tanstack/react-router';
import { AppHeader } from '../app/AppHeader';
import { backTarget } from '../app/back-target';
import { ShareScreen } from '../share/ShareScreen';

type ShareSearch = { pending?: string; deck?: string; failed?: boolean };

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 100 ? value : undefined;
}

/** D108: share-target confirm screen (`?pending=`) and paste box (`?deck=`). */
export const Route = createFileRoute('/share')({
  validateSearch: (search: Record<string, unknown>): ShareSearch => {
    const result: ShareSearch = {};
    const pending = optionalString(search.pending);
    const deck = optionalString(search.deck);
    if (pending) result.pending = pending;
    if (deck) result.deck = deck;
    if (search.failed === 1 || search.failed === '1' || search.failed === true) {
      result.failed = true;
    }
    return result;
  },
  component: Share,
});

function Share() {
  const { pending, deck, failed } = Route.useSearch();
  return (
    <>
      <AppHeader title="Share to Gobbit" back={backTarget({ kind: 'top' })} />
      <main className="page">
        <ShareScreen pendingId={pending} requestedDeck={deck} failed={failed} />
      </main>
    </>
  );
}
