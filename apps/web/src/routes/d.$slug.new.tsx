import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { can } from '@pb/shared/authz';
import { categoriesQuery, configQuery, deckQuery } from '../api/queries';
import { backTarget } from '../app/back-target';
import { isCreatableType, type CreatableType } from '../editor/creatable-types';
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
  const config = useQuery(configQuery());

  // The deck layout already shows loading and access errors for the deck itself.
  if (!deck.data) return null;
  if (!can(deck.data.role, 'item.create')) {
    return (
      <ErrorState
        title="You can't add cards here"
        message="Your role in this deck doesn't allow adding cards."
      />
    );
  }
  if (categories.isPending) return <LoadingState label="Loading categories…" />;
  if (type === 'image' && config.isPending) return <LoadingState label="Loading…" />;
  if (categories.isError && !categories.data) {
    return (
      <ErrorState
        message="Couldn't load the categories for this deck."
        onRetry={() => void categories.refetch()}
      />
    );
  }

  // FR-015: without image storage `?type=image` opens a text card instead.
  const imagesOff = !config.data?.cloudinaryCloudName;
  const effectiveType = type === 'image' && imagesOff ? 'text' : type;

  return (
    <CardEditor
      mode="create"
      deck={deck.data}
      type={effectiveType}
      categories={categories.data}
      backHref={backTarget({ kind: 'new-card', deckSlug: deck.data.slug })}
      // Same screen, so the unsaved-changes guard has nothing to ask about.
      onTypeChange={(next) =>
        void navigate({ search: { type: next }, replace: true, ignoreBlocker: true })
      }
    />
  );
}
