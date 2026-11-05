import { useCallback, useEffect, type ReactElement, type ReactNode } from 'react';
import type { Category } from '@gobbit/shared';
import { isNetworkError } from '../api/network-state';
import type { ItemFilter } from '../api/query-keys';
import { emptyListCopy } from '../items/empty-copy';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { filterKey } from './browse-params';
import { BrowseStack, type BrowseEndProps, type StackCurrent } from './BrowseStack';
import { useBrowseItems } from './use-browse-items';

export const OFFLINE_COPY = "You're offline and these cards aren't saved on this device yet.";

/** Contract §4: one page with the list's copy; the top bar and sideways moves stay, no dock. */
function StatePage({
  active,
  onCurrent,
  children,
}: {
  active: boolean;
  onCurrent: (current: StackCurrent | null) => void;
  children: ReactNode;
}): ReactElement {
  useEffect(() => {
    if (active) onCurrent(null);
  }, [active, onCurrent]);
  return (
    <div className="browse__track">
      <section className="browse-page browse-page--state">
        <div className="browse-card browse-card--state">{children}</div>
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
  category,
  onSettle,
  onCurrent,
  onOpenFull,
  end,
  active,
  keysEnabled,
}: {
  deckSlug: string;
  filter: ItemFilter;
  categories: readonly Category[];
  /** The card to open on: the address's `i`, or a jump's target (D328). */
  targetId: string | undefined;
  /** The cycle slug of this category (`all` or a category slug); settles report it. */
  category: string;
  onSettle: (category: string, itemId: string) => void;
  onCurrent: (current: StackCurrent | null) => void;
  onOpenFull: () => void;
  end: BrowseEndProps;
  active: boolean;
  keysEnabled: boolean;
}): ReactElement {
  const { query, items, seeking, notFound, total } = useBrowseItems(deckSlug, filter, targetId);
  const settle = useCallback((itemId: string) => onSettle(category, itemId), [onSettle, category]);
  const state = (body: ReactNode) => (
    <StatePage active={active} onCurrent={onCurrent}>
      {body}
    </StatePage>
  );

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
      onSettle={settle}
      onCurrent={onCurrent}
      onOpenFull={onOpenFull}
      end={end}
      active={active}
      keysEnabled={keysEnabled}
    />
  );
}
