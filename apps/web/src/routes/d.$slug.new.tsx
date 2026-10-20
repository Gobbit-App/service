import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { can } from '@pb/shared/authz';
import { categoriesQuery, deckQuery } from '../api/queries';
import { isCreatableType, type CreatableType } from '../editor/draft';
import { CardEditor } from '../editor/CardEditor';
import { ErrorState, LoadingState } from '../ui/StatusViews';

type NewCardSearch = { type?: CreatableType };

/** D135: the card editor in create mode, inside the deck layout (`/d/:slug/new?type=`). */
export const Route = createFileRoute('/d/$slug/new')({
  validateSearch: (search: Record<string, unknown>): NewCardSearch =>
    isCreatableType(search['type']) ? { type: search['type'] } : {},
  component: NewCard,
});

function NewCard() {
  const { slug } = Route.useParams();
  const { type = 'text' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const deck = useQuery(deckQuery(slug));
  const categories = useQuery(categoriesQuery(slug));

  // The deck layout already shows loading and access errors for the deck itself.
  if (!deck.data) return null;
  if (!can(deck.data.role, 'item.create')) {
    return (
      <ErrorState
        title="You can't add cards here"
        message="Your role in this pocketbook doesn't allow adding cards."
      />
    );
  }
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
      mode="create"
      deck={deck.data}
      type={type}
      categories={categories.data}
      onTypeChange={(next) => void navigate({ search: { type: next }, replace: true })}
    />
  );
}
