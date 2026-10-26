import { createFileRoute } from '@tanstack/react-router';
import { DeckItems } from '../items/DeckItems';

/**
 * D165 "Links to check": flagged link cards, newest flag first. The chip only shows for roles
 * with `item.update`; the API enforces it either way. Each card's bar offers Check again, its
 * menu Dismiss (D213).
 */
export const Route = createFileRoute('/d/$slug/links')({
  component: function LinksToCheck() {
    const { slug } = Route.useParams();
    return <DeckItems slug={slug} filter={{ kind: 'links' }} />;
  },
});
