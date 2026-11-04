import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { categoriesQuery, deckQuery, itemQuery, meQuery } from '../api/queries';
import { backTarget } from '../app/back-target';
import { canEditItem } from '../cards/can-edit-item';
import { CardEditor } from '../editor/CardEditor';
import { parseEditSearch } from '../editor/edit-search';
import { accessErrorCopy, isRetryable } from '../lib/access-copy';
import { ErrorState, LoadingState } from '../ui/StatusViews';

/**
 * D135: the card editor in edit mode (`/i/:itemId/edit?from=review|back=…`), outside the deck
 * layout.
 */
export const Route = createFileRoute('/i/$itemId_/edit')({
  validateSearch: parseEditSearch,
  component: EditCard,
});

function Unavailable({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <main className="page">
      <ErrorState title="Card unavailable" message={message} onRetry={onRetry} />
    </main>
  );
}

function EditCard() {
  const { itemId } = Route.useParams();
  const { from, back: opener } = Route.useSearch();
  const item = useQuery(itemQuery(itemId));
  const deckId = item.data?.deckId;
  const enabled = deckId !== undefined;
  const deck = useQuery({ ...deckQuery(deckId ?? ''), enabled });
  const categories = useQuery({ ...categoriesQuery(deckId ?? ''), enabled });
  const me = useQuery(meQuery());

  if (item.isPending) return <LoadingState label="Loading card…" />;
  if (item.isError && !item.data) {
    return (
      <Unavailable
        message={accessErrorCopy(item.error, 'card')}
        onRetry={isRetryable(item.error) ? () => void item.refetch() : undefined}
      />
    );
  }
  if (item.data.deletedAt !== undefined) return <Unavailable message="This card was deleted." />;
  if (deck.isPending || categories.isPending || me.isPending) {
    return <LoadingState label="Loading editor…" />;
  }
  if (!deck.data || !categories.data) {
    return (
      <Unavailable
        message="Couldn't load this card's deck."
        onRetry={() => void Promise.all([deck.refetch(), categories.refetch()])}
      />
    );
  }
  // R8: the same rule as the Edit link; the API enforces it again on save.
  if (!canEditItem(item.data, deck.data.role, me.data?.user.id)) {
    return <Unavailable message="You can't edit this card." />;
  }

  const back = backTarget({
    kind: 'edit',
    itemId: item.data.id,
    deckSlug: deck.data.slug,
    from,
    back: opener,
  });
  // D300: the composer brings its own top bar (Close, heading, Save) and landmarks.
  return (
    <CardEditor
      key={item.data.id}
      mode="edit"
      deck={deck.data}
      item={item.data}
      categories={categories.data}
      from={from}
      opener={opener}
      backHref={back}
    />
  );
}
