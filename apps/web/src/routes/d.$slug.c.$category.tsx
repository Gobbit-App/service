import { createFileRoute } from '@tanstack/react-router';
import { DeckItems } from '../items/DeckItems';

export const Route = createFileRoute('/d/$slug/c/$category')({
  component: function CategoryItems() {
    const { slug, category } = Route.useParams();
    return <DeckItems slug={slug} filter={{ kind: 'category', slug: category }} />;
  },
});
