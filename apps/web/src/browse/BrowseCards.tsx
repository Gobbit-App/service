import type { ReactElement, ReactNode } from 'react';
import type { Category } from '@gobbit/shared';
import { isNetworkError } from '../api/network-state';
import type { ItemFilter } from '../api/query-keys';
import { emptyListCopy } from '../items/empty-copy';
import { EmptyState, ErrorState, LoadingState } from '../ui/StatusViews';
import { filterKey, type BrowsePane } from './browse-params';
import { BrowseStack, type BrowseStackProps } from './BrowseStack';
import { FooterBand } from './FooterBand';
import { HeaderBand } from './HeaderBand';
import { useBrowseItems } from './use-browse-items';

export const OFFLINE_COPY = "You're offline and these cards aren't saved on this device yet.";

/** Contract §4: one page with an active header (category change still works) and no cards. */
function StatePage({
  header,
  pane,
  children,
}: {
  header: BrowseStackProps['header'];
  pane: BrowsePane;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="browse__pages">
      <section className="browse-page browse-page--state">
        <HeaderBand {...header} position={null} onPrevCard={null} onNextCard={null} active />
        <div className="browse-page__content">{children}</div>
        <FooterBand pageId="state" pane={pane} onPane={() => undefined} active={false} disabled />
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
  pane,
  onPane,
  onSettle,
  header,
  keysEnabled,
}: {
  deckSlug: string;
  filter: ItemFilter;
  categories: readonly Category[];
  /** The address's `i`. */
  targetId: string | undefined;
  pane: BrowsePane;
  onPane: (pane: BrowsePane) => void;
  onSettle: (itemId: string) => void;
  header: BrowseStackProps['header'];
  keysEnabled: boolean;
}): ReactElement {
  const { query, items, seeking, notFound, total } = useBrowseItems(deckSlug, filter, targetId);
  const state = (body: ReactNode) => (
    <StatePage header={header} pane={pane}>
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
      pane={pane}
      onPane={onPane}
      onSettle={onSettle}
      header={header}
      keysEnabled={keysEnabled}
    />
  );
}
