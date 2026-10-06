import { createFileRoute } from '@tanstack/react-router';
import { DeckItems } from '../items/DeckItems';

/** The chip only shows for roles with `item.archive`; the API enforces it either way. */
export const Route = createFileRoute('/d/$slug/archived')({
  component: function ArchivedItems() {
    const { slug } = Route.useParams();
    return <DeckItems slug={slug} filter={{ kind: 'archived' }} />;
  },
});
