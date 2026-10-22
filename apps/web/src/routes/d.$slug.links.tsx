import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { deckQuery } from '../api/queries';
import { EditLink } from '../cards/EditLink';
import { CardActions } from '../items/CardActions';
import { DeckItems } from '../items/DeckItems';

/**
 * D165 "Links to check": flagged link cards, newest flag first. The chip only shows for roles
 * with `item.update`; the API enforces it either way. Each card offers Check again / Dismiss.
 */
export const Route = createFileRoute('/d/$slug/links')({
  component: function LinksToCheck() {
    const { slug } = Route.useParams();
    const role = useQuery(deckQuery(slug)).data?.role;
    return (
      <DeckItems
        slug={slug}
        filter={{ kind: 'links' }}
        renderActions={
          role
            ? (item) => (
                <CardActions item={item} deckSlug={slug} role={role}>
                  <EditLink item={item} role={role} />
                </CardActions>
              )
            : undefined
        }
      />
    );
  },
});
