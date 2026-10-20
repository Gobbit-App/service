import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { Category, Deck } from '@pb/shared';
import { problemMessages } from '../api/problem-messages';
import { reviewQuery, useDiscardProposal, usePublishProposal } from '../api/review';
import { useUpdateItem } from '../api/update-item';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { ReviewCard } from './ReviewCard';

/** D107: the deck's proposals, newest first, each with publish / edit / discard. */
export function ReviewQueue({
  deck,
  categories,
  canCreateCategory,
}: {
  deck: Deck;
  categories: readonly Category[];
  canCreateCategory: boolean;
}): ReactElement {
  const deckSlug = deck.slug;
  const queue = useQuery(reviewQuery(deckSlug));
  const publish = usePublishProposal(deckSlug);
  const discard = useDiscardProposal(deckSlug);
  const update = useUpdateItem(deckSlug);
  const failure = publish.error ?? discard.error;

  if (queue.isPending) return <LoadingState label="Loading proposals…" />;
  if (queue.isError) {
    return (
      <ErrorState message="Couldn't load the review queue." onRetry={() => void queue.refetch()} />
    );
  }
  if (queue.data.data.length === 0) {
    return (
      <EmptyState title="Nothing to review">
        Shared cards waiting for approval show up here.
      </EmptyState>
    );
  }

  return (
    <section className="review-queue" aria-label="Proposals">
      {failure && (
        <div className="form-error" role="alert">
          {problemMessages(failure).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      {queue.data.data.map((entry) => (
        <ReviewCard
          key={entry.item.id}
          entry={entry}
          deck={deck}
          categories={categories}
          canCreateCategory={canCreateCategory}
          busy={publish.isPending || discard.isPending}
          onPublish={(request) => publish.mutate({ itemId: entry.item.id, ...request })}
          onDiscard={() => discard.mutate({ itemId: entry.item.id })}
          onSaveEdit={(patch) => update.mutateAsync({ itemId: entry.item.id, patch })}
        />
      ))}
    </section>
  );
}
