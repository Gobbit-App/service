import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { can } from '@gobbit/shared/authz';
import { categoriesQuery, configQuery, deckQuery } from '../api/queries';
import { backTarget } from '../app/back-target';
import { isCreatableType, type CreatableType } from '../editor/creatable-types';
import { CardEditor } from '../editor/CardEditor';
import { TypeChooser } from '../editor/composer/TypeChooser';
import { useStartScreen } from '../editor/composer/use-start-screen';
import { ErrorState, LoadingState } from '../ui/StatusViews';

type NewCardSearch = { type?: CreatableType };

/**
 * D135 / D300: the card editor in create mode (`/d/:slug/new?type=`). The deck layout steps aside
 * here, so the states before the composer bring their own page frame. Without a usable `?type=`
 * the type chooser comes first (D301, D302).
 */
export const Route = createFileRoute('/d/$slug/new')({
  validateSearch: (search: Record<string, unknown>): NewCardSearch =>
    isCreatableType(search['type']) ? { type: search['type'] } : {},
  component: NewCard,
});

function NewCard() {
  const { slug } = Route.useParams();
  const { type } = Route.useSearch();
  const navigate = Route.useNavigate();
  const deck = useQuery(deckQuery(slug));
  const categories = useQuery(categoriesQuery(slug));
  const config = useQuery(configQuery());
  // D301: set when the type was picked here, so the composer starts in the title.
  const [picked, setPicked] = useState(false);
  // FR-015: a failed config read counts as no image storage, like before.
  const imagesOff = !config.data?.cloudinaryCloudName;
  const start = useStartScreen({ deckId: deck.data?.id ?? '', urlType: type, imagesOff });

  // The deck layout already shows loading and access errors for the deck itself.
  if (!deck.data) return null;
  if (!can(deck.data.role, 'item.create')) {
    return (
      <main className="page">
        <ErrorState
          title="You can't add cards here"
          message="Your role in this deck doesn't allow adding cards."
        />
      </main>
    );
  }
  if (categories.isPending) return <LoadingState label="Loading categories…" />;
  if (config.isPending || !start) return <LoadingState label="Loading…" />;
  if (categories.isError && !categories.data) {
    return (
      <main className="page">
        <ErrorState
          message="Couldn't load the categories for this deck."
          onRetry={() => void categories.refetch()}
        />
      </main>
    );
  }

  const backHref = backTarget({ kind: 'new-card', deckSlug: deck.data.slug });
  if (start.kind === 'chooser') {
    return (
      <TypeChooser
        deckName={deck.data.name}
        closeHref={backHref}
        imagesOff={imagesOff}
        onPick={(next) => {
          setPicked(true);
          // Replace: Back from the composer leaves instead of returning to the chooser.
          void navigate({ search: { type: next }, replace: true });
        }}
      />
    );
  }

  return (
    <CardEditor
      mode="create"
      deck={deck.data}
      type={start.type}
      focusTitle={picked}
      categories={categories.data}
      backHref={backHref}
      // Same screen, so the unsaved-changes guard has nothing to ask about.
      onTypeChange={(next) =>
        void navigate({ search: { type: next }, replace: true, ignoreBlocker: true })
      }
    />
  );
}
