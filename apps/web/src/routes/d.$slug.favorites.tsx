import { createFileRoute } from '@tanstack/react-router';
import { DeckItems } from '../items/DeckItems';

export const Route = createFileRoute('/d/$slug/favorites')({
  component: function FavoriteItems() {
    const { slug } = Route.useParams();
    return <DeckItems slug={slug} filter={{ kind: 'favorites' }} />;
  },
});
