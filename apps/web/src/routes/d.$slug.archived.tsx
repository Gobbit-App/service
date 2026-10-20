import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { can } from '@pb/shared/authz';
import { deckQuery } from '../api/queries';
import { CardActions } from '../items/CardActions';
import { DeckItems } from '../items/DeckItems';
import { DeletedSection } from '../items/DeletedSection';

/**
 * The chip only shows for roles with `item.archive`; the API enforces it either way.
 * Each card offers Restore (D131); `item.delete` roles also get Recently deleted (D132).
 */
export const Route = createFileRoute('/d/$slug/archived')({
  component: function ArchivedItems() {
    const { slug } = Route.useParams();
    const deck = useQuery(deckQuery(slug));
    const role = deck.data?.role;
    return (
      <>
        <DeckItems
          slug={slug}
          filter={{ kind: 'archived' }}
          renderActions={
            role ? (item) => <CardActions item={item} deckSlug={slug} role={role} /> : undefined
          }
        />
        {role && can(role, 'item.delete') && <DeletedSection deckSlug={slug} role={role} />}
      </>
    );
  },
});
