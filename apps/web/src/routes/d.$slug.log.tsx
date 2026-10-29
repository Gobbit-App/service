import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { can } from '@pb/shared/authz';
import { deckQuery } from '../api/queries';
import { EventLog } from '../events/EventLog';
import { parseLogSearch } from '../events/log-search';
import { ErrorState, LoadingState } from '../ui/StatusViews';

/** D188: the deck's activity log (`/d/:slug/log`), owners and maintainers only. */
export const Route = createFileRoute('/d/$slug/log')({
  validateSearch: parseLogSearch,
  component: ActivityLog,
});

function ActivityLog() {
  const { slug } = Route.useParams();
  const { item } = Route.useSearch();
  const deck = useQuery(deckQuery(slug));

  if (deck.isPending) return <LoadingState label="Loading…" />;
  if (!deck.data) return <ErrorState message="Couldn't load this deck." />;
  if (!can(deck.data.role, 'event.list')) {
    return (
      <ErrorState title="Not available" message="Only owners and maintainers see the activity." />
    );
  }
  return <EventLog deckSlug={slug} itemId={item} />;
}
