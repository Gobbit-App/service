import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactElement } from 'react';
import type { Deck, Item, PublishRequest, ReviewEntry } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import { problemMessages } from '../api/problem-messages';
import { queryKeys } from '../api/query-keys';
import { reviewQuery, useDiscardProposal, usePublishProposal } from '../api/review';
import { IconButton } from '../ui/buttons/IconButton';
import { deckHref } from '../ui/chip-order';
import { useNavigateHref } from '../ui/NavLink';
import { CreateCategoryToggle, PublishButtons } from './PublishButtons';
import { REVIEW_BANNER, reviewMode, suggestedCategory } from './review-mode';

/** Publishers see the review decision on a proposal's own page (opened from the log or shares). */
export function canReviewOnCard(item: Item, role: Deck['role'] | undefined): boolean {
  return (
    role !== undefined &&
    item.status === 'proposed' &&
    item.deletedAt === undefined &&
    can(role, 'item.publish')
  );
}

/** The queue entry for `item`, or a bare one (publish as new) when the queue doesn't list it. */
export function entryFor(item: Item, entries: readonly ReviewEntry[] | undefined): ReviewEntry {
  return entries?.find((entry) => entry.item.id === item.id) ?? { item, job: null, target: null };
}

/**
 * D106 on the card page: the same publish / discard decision as the review queue. Publishing
 * shows the resulting card (the target, for an applied update); discarding returns to the deck.
 */
export function ProposalReview({ item, deck }: { item: Item; deck: Deck }): ReactElement {
  const deckSlug = deck.slug;
  const qc = useQueryClient();
  const navigate = useNavigateHref();
  const queue = useQuery(reviewQuery(deckSlug));
  const publish = usePublishProposal(deckSlug);
  const discard = useDiscardProposal(deckSlug);
  const [createCategory, setCreateCategory] = useState(true);
  const titleId = useId();

  const entry = entryFor(item, queue.data?.data);
  const mode = reviewMode(entry);
  const suggestion = suggestedCategory(entry, can(deck.role, 'category.create'));
  const withCategory = suggestion && createCategory ? { createCategory: true } : {};
  const busy = queue.isPending || publish.isPending || discard.isPending;
  const failure = publish.error ?? discard.error;

  const onPublish = (request: Partial<PublishRequest>) =>
    publish.mutate(
      { itemId: item.id, ...request },
      {
        onSuccess: (published) => {
          qc.setQueryData(queryKeys.item(published.id), published);
          if (published.id !== item.id) {
            qc.removeQueries({ queryKey: queryKeys.item(item.id), exact: true });
            navigate(`/i/${published.id}`, { replace: true });
          }
        },
      },
    );

  const onDiscard = () =>
    discard.mutate({ itemId: item.id }, { onSuccess: () => navigate(deckHref(deckSlug)) });

  return (
    <section className="card review-card proposal-review" aria-labelledby={titleId}>
      <h2 className="proposal-review__title" id={titleId}>
        Waiting for review
      </h2>
      {mode.kind !== 'new' && (
        <p className="review-card__banner">
          {REVIEW_BANNER[mode.kind]}: <strong dir="auto">{mode.target.title}</strong>
        </p>
      )}
      {suggestion && (
        <CreateCategoryToggle
          name={suggestion}
          checked={createCategory}
          onChange={setCreateCategory}
        />
      )}
      {failure && (
        <div className="form-error" role="alert">
          {problemMessages(failure).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      <div className="card__bar" role="group" aria-label="Review actions">
        <PublishButtons mode={mode} busy={busy} extra={withCategory} onPublish={onPublish} />
        <IconButton
          icon="reject"
          label="Discard"
          tone="danger"
          disabled={busy}
          onClick={onDiscard}
        />
      </div>
    </section>
  );
}
