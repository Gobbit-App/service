import { createFileRoute } from '@tanstack/react-router';
import { DeckItems } from '../items/DeckItems';

/**
 * 037 (D292): reminders that aren't showing yet, soonest first. Linked from the deck ⋯ menu for
 * `item.update` roles; owners and maintainers see all of them, everyone else only their own.
 * Each card's status line says when it shows and when it's due.
 */
export const Route = createFileRoute('/d/$slug/upcoming')({
  component: function UpcomingItems() {
    const { slug } = Route.useParams();
    return <DeckItems slug={slug} filter={{ kind: 'upcoming' }} />;
  },
});
