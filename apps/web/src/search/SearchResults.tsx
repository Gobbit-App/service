import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Category } from '@gobbit/shared';
import { isNetworkError } from '../api/network-state';
import { searchQuery } from '../api/queries';
import { Card } from '../cards/Card';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { RecentSearches } from './RecentSearches';
import { ResultTag } from './ResultTag';

/** D79: deck search results with recent searches, offline and error states. */
export function SearchResults({
  deckSlug,
  q,
  categories,
  online,
  recent,
  onPickRecent,
}: {
  deckSlug: string;
  q: string;
  categories: readonly Category[];
  online: boolean;
  recent: readonly string[];
  onPickRecent: (q: string) => void;
}): ReactElement {
  const query = useQuery(searchQuery(deckSlug, q));
  const { data, error, isError, isPending, isPlaceholderData, refetch } = query;

  if (q.trim().length === 0) {
    if (recent.length === 0) {
      return <EmptyState title="Search this deck">Type a word, a name or a number.</EmptyState>;
    }
    return <RecentSearches items={recent} onPick={onPickRecent} />;
  }

  if (!online || (isError && isNetworkError(error))) {
    return (
      <>
        <EmptyState title="Search needs a connection">
          Recent searches are below; results appear when you're back online.
        </EmptyState>
        <RecentSearches items={recent} onPick={onPickRecent} />
      </>
    );
  }

  if (isPending) {
    return <LoadingState label="Searching…" />;
  }

  if (isError && !data) {
    return <ErrorState message="Something went wrong searching." onRetry={() => void refetch()} />;
  }

  const hits = data?.data ?? [];
  if (hits.length === 0) {
    return <EmptyState title={`No cards match “${q}”`}>Try fewer or different words.</EmptyState>;
  }

  return (
    <ol className="search-results" aria-busy={isPlaceholderData}>
      {hits.map((hit) => (
        <li className="search-hit" key={hit.item.id}>
          <ResultTag why={hit.why} />
          <Card item={hit.item} deckSlug={deckSlug} categories={categories} highlight={q} />
        </li>
      ))}
    </ol>
  );
}
