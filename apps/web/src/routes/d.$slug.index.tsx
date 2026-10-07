import { createFileRoute } from '@tanstack/react-router';
import { DeckItems } from '../items/DeckItems';

export const Route = createFileRoute('/d/$slug/')({
  component: function AllItems() {
    const { slug } = Route.useParams();
    return <DeckItems slug={slug} filter={{ kind: 'all' }} />;
  },
});
