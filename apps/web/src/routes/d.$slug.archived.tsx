import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { can } from '@gobbit/shared/authz';
import { deckQuery } from '../api/queries';
import { DeckItems } from '../items/DeckItems';
import { DeletedSection } from '../items/DeletedSection';

/**
 * The chip only shows for roles with `item.archive`; the API enforces it either way.
 * Each card's bar offers Restore (D131, D213); `item.delete` roles also get Recently deleted (D132).
 */
export const Route = createFileRoute('/d/$slug/archived')({
  component: function ArchivedItems() {
    const { slug } = Route.useParams();
    const role = useQuery(deckQuery(slug)).data?.role;
    return (
      <>
        <DeckItems slug={slug} filter={{ kind: 'archived' }} />
        {role && can(role, 'item.delete') && <DeletedSection deckSlug={slug} role={role} />}
      </>
    );
  },
});
