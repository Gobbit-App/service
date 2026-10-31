import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { can } from '@gobbit/shared/authz';
import { deckQuery } from '../api/queries';
import { SharesScreen } from '../shares/SharesScreen';
import { ErrorState } from '../ui/StatusViews';

/** D198: "Your shares" (`/d/:slug/shares`); the deck layout handles loading and errors. */
export const Route = createFileRoute('/d/$slug/shares')({
  component: Shares,
});

function Shares() {
  const { slug } = Route.useParams();
  const deck = useQuery(deckQuery(slug));

  if (!deck.data) return null;
  if (!can(deck.data.role, 'item.create')) {
    return <ErrorState title="Not available" message="Readers can't share to this deck." />;
  }
  return <SharesScreen deckSlug={slug} canRestore={can(deck.data.role, 'item.delete')} />;
}
