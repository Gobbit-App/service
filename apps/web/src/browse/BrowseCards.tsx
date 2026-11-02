import { useEffect, type ReactElement, type ReactNode } from 'react';
import type { Category } from '@gobbit/shared';
import { isNetworkError } from '../api/network-state';
import type { ItemFilter } from '../api/query-keys';
import { emptyListCopy } from '../items/empty-copy';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { filterKey } from './browse-params';
import { BrowseStack, type BrowseEndProps } from './BrowseStack';
import type { BrowsePosition } from './TopBar';
import { useBrowseItems } from './use-browse-items';

export const OFFLINE_COPY = "You're offline and these cards aren't saved on this device yet.";

/** Contract §4: one page with the list's copy; the top bar stays usable, no dock. */
function StatePage({
  onPosition,
  children,
}: {
  onPosition: (position: BrowsePosition | null) => void;
  children: ReactNode;
}): ReactElement {
  useEffect(() => onPosition(null), [onPosition]);
  return (
    <div className="browse__track">
      <section className="browse-page browse-page--state">
        <div className="browse-sheet">{children}</div>
      </section>
    </div>
  );
}

/** US1: one category's cards in Browse, or its loading/empty/offline state. */
export function BrowseCards({
  deckSlug,
  filter,
  categories,
  targetId,
  onSettle,
  onPosition,
  end,
  keysEnabled,
}: {
  deckSlug: string;
  filter: ItemFilter;
  categories: readonly Category[];
  /** The address's `i`. */
  targetId: string | undefined;
  onSettle: (itemId: string) => void;
  onPosition: (position: BrowsePosition | null) => void;
  end: BrowseEndProps;
  keysEnabled: boolean;
}): ReactElement {
  const { query, items, seeking, notFound, total } = useBrowseItems(deckSlug, filter, targetId);
  const state = (body: ReactNode) => <StatePage onPosition={onPosition}>{body}</StatePage>;

  if (query.isPending || seeking) return state(<LoadingState label="Loading cards…" />);
  if (query.isError && !query.data) {
    return state(
      <ErrorState
        message={
          isNetworkError(query.error) ? OFFLINE_COPY : 'Something went wrong loading these cards.'
        }
        onRetry={() => void query.refetch()}
      />,
    );
  }
  const first = items[0];
  if (!first) {
    const copy = emptyListCopy(filter);
    return state(<EmptyState title={copy.title}>{copy.body}</EmptyState>);
  }

  return (
    <BrowseStack
      deckSlug={deckSlug}
      filterKey={filterKey(filter)}
      categories={categories}
      items={items}
      total={total}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      fetchNextPage={query.fetchNextPage}
      initialId={targetId && !notFound ? targetId : first.id}
      addressId={targetId}
      notFound={notFound}
      onSettle={onSettle}
      onPosition={onPosition}
      end={end}
      keysEnabled={keysEnabled}
    />
  );
}
