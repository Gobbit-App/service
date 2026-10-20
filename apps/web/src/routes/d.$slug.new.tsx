import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { categoriesQuery } from '../api/queries';
import { CardEditor } from '../items/CardEditor';
import { deckHref } from '../ui/chip-order';
import { useNavigateHref } from '../ui/NavLink';
import { ErrorState, LoadingState } from '../ui/StatusViews';

/** Phase 3B: minimal card editor, rendered inside the deck layout (`/d/:slug/new`). */
export const Route = createFileRoute('/d/$slug/new')({
  component: NewCard,
});

function NewCard() {
  const { slug } = Route.useParams();
  const categories = useQuery(categoriesQuery(slug));
  const navigate = useNavigateHref();

  if (categories.isPending) return <LoadingState label="Loading categories…" />;
  if (categories.isError && !categories.data) {
    return (
      <ErrorState
        message="Couldn't load the categories for this pocketbook."
        onRetry={() => void categories.refetch()}
      />
    );
  }

  return (
    <CardEditor
      deckSlug={slug}
      categories={categories.data}
      onSaved={() => navigate(deckHref(slug))}
    />
  );
}
