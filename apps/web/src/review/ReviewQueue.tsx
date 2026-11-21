import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import type { Category, Deck, DiscardImportResult } from '@gobbit/shared';
import { IMPORT_DISCARD_MAX } from '@gobbit/shared/ingest-constants';
import { problemMessages } from '../api/problem-messages';
import {
  reviewQuery,
  useBulkPublish,
  useDiscardImport,
  useDiscardProposal,
  usePublishProposal,
} from '../api/review';
import { useUpdateItem } from '../api/update-item';
import { deckHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { BulkPublishNotice } from './BulkPublishNotice';
import { bulkPublishSummary, type BulkPublishSummary } from './bulk-publish-summary';
import { DiscardImportSheet } from './DiscardImportSheet';
import { ReviewCard } from './ReviewCard';
import { ReviewSelectBar } from './ReviewSelectBar';
import { Button } from '../ui/buttons/Button';
import { ButtonLink } from '../ui/buttons/ButtonLink';

/**
 * D107: the deck's proposals, newest first, each with publish / edit / discard.
 * D191: `source` narrows it to one import; select mode publishes many at once.
 */
export function ReviewQueue({
  deck,
  categories,
  canCreateCategory,
  source,
}: {
  deck: Deck;
  categories: readonly Category[];
  canCreateCategory: boolean;
  source?: string;
}): ReactElement {
  const deckSlug = deck.slug;
  const queue = useQuery(reviewQuery(deckSlug, source));
  const publish = usePublishProposal(deckSlug);
  const discard = useDiscardProposal(deckSlug);
  const bulk = useBulkPublish(deckSlug);
  const discardImport = useDiscardImport(deckSlug);
  const update = useUpdateItem(deckSlug);
  const [confirming, setConfirming] = useState(false);
  const [discarded, setDiscarded] = useState<DiscardImportResult | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [summary, setSummary] = useState<BulkPublishSummary | null>(null);
  const failure = publish.error ?? discard.error ?? bulk.error ?? discardImport.error;
  const busy = publish.isPending || discard.isPending || bulk.isPending || discardImport.isPending;

  const sourceChip = source && (
    <p className="review-source">
      <span className="chip chip--small">From “{source}”</span>
      <NavLink href={deckHref(deckSlug, 'review')} className="review-source__clear">
        Show all
      </NavLink>
    </p>
  );

  if (queue.isPending) return <LoadingState label="Loading proposals…" />;
  if (queue.isError) {
    return (
      <ErrorState message="Couldn't load the review queue." onRetry={() => void queue.refetch()} />
    );
  }

  const entries = queue.data.data;
  const shownIds = entries.map((entry) => entry.item.id);
  const selectedShown = shownIds.filter((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const publishSelected = () => {
    setSummary(null);
    bulk.mutate(selectedShown, {
      onSuccess: (result) => {
        setSummary(bulkPublishSummary(result, entries));
        setSelected(new Set());
      },
    });
  };

  const discardNotice = discarded && (
    <div className="bulk-publish-notice" role="status">
      <p>
        Discarded {discarded.discarded} {discarded.discarded === 1 ? 'card' : 'cards'}
      </p>
      {discarded.skipped > 0 && <p>Skipped {discarded.skipped}, still in the queue.</p>}
      {discarded.discarded + discarded.skipped >= IMPORT_DISCARD_MAX && (
        <p>More cards from this import may remain. Discard again to clear them.</p>
      )}
      <Button icon="close" label="Dismiss" variant="ghost" onClick={() => setDiscarded(null)} />
    </div>
  );

  const confirmDiscard = () => {
    if (!source) return;
    setDiscarded(null);
    discardImport.mutate(source, {
      onSuccess: (result) => {
        setDiscarded(result);
        setConfirming(false);
      },
    });
  };

  if (entries.length === 0) {
    return (
      <section className="review-queue" aria-label="Proposals">
        {sourceChip}
        {summary && <BulkPublishNotice summary={summary} onDismiss={() => setSummary(null)} />}
        {discardNotice}
        <EmptyState
          title="Nothing to review"
          action={
            <ButtonLink
              href={deckHref(deckSlug, 'shares')}
              icon="send"
              label="Your shares"
              variant="ghost"
            />
          }
        >
          Shared cards waiting for approval show up here. Your own shares and their status are in
          Your shares.
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="review-queue" aria-label="Proposals">
      {sourceChip}
      <ReviewSelectBar
        selecting={selecting}
        selectedCount={selectedShown.length}
        shownCount={shownIds.length}
        busy={busy}
        onToggleMode={() => {
          setSelecting((on) => !on);
          setSelected(new Set());
        }}
        onSelectAll={() => setSelected(new Set(shownIds))}
        onPublish={publishSelected}
        onDiscardImport={source ? () => setConfirming(true) : undefined}
      />
      {confirming && source && (
        <DiscardImportSheet
          source={source}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={confirmDiscard}
        />
      )}
      {discardNotice}
      {summary && <BulkPublishNotice summary={summary} onDismiss={() => setSummary(null)} />}
      {failure && (
        <div className="form-error" role="alert">
          {problemMessages(failure).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      {entries.map((entry) => (
        <ReviewCard
          key={entry.item.id}
          entry={entry}
          deck={deck}
          categories={categories}
          canCreateCategory={canCreateCategory}
          busy={busy}
          selection={
            selecting
              ? {
                  checked: selected.has(entry.item.id),
                  onToggle: () => toggle(entry.item.id),
                }
              : undefined
          }
          onPublish={(request) => publish.mutate({ itemId: entry.item.id, ...request })}
          onDiscard={() => discard.mutate({ itemId: entry.item.id })}
          onSaveEdit={(patch) => update.mutateAsync({ itemId: entry.item.id, patch })}
        />
      ))}
    </section>
  );
}
