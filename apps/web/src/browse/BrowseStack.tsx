import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { Category, Item } from '@pb/shared';
import type { BrowsePane } from './browse-params';
import { writeBrowseReturn } from './browse-return';
import { BrowsePage } from './BrowsePage';
import type { HeaderBandProps } from './HeaderBand';
import { positionLabel } from './HeaderBand';
import { pagingBehavior, scrollToPage } from './motion';
import { useBrowseKeys } from './use-browse-keys';
import { usePrefetchAhead } from './use-browse-items';
import { useCurrentCard } from './use-current-card';

export const NOT_FOUND_COPY = "That card isn't available here";

export interface BrowseStackProps {
  deckSlug: string;
  /** `filterKey()` of the Browse filter, for the return entry. */
  filterKey: string;
  categories: readonly Category[];
  items: readonly Item[];
  /** Null while more pages exist. */
  total: number | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  /** The card to open on (the deep link, or the first card). */
  initialId: string;
  /** The address's `i`; the address follows the card once it settles. */
  addressId: string | undefined;
  /** The deep-linked card wasn't found (the stack opens on the first card). */
  notFound: boolean;
  pane: BrowsePane;
  onPane: (pane: BrowsePane) => void;
  onSettle: (itemId: string) => void;
  header: Omit<HeaderBandProps, 'active' | 'position' | 'onPrevCard'>;
  /** Off while the first-run hint is open. */
  keysEnabled: boolean;
}

/** Focus follows the card (contract §3) unless the reader is working elsewhere on the page. */
function focusTitle(container: HTMLElement | null, itemId: string): void {
  const active = document.activeElement;
  const idle = !active || active === document.body;
  if (!idle && !container?.contains(active)) return;
  const title = document.getElementById(`card-title-${itemId}`);
  if (!title || title === active) return;
  title.setAttribute('tabindex', '-1');
  title.focus({ preventScroll: true });
}

/** US1: the snap container of one category's cards, tracked by id, ±1 mounted. */
export function BrowseStack({
  deckSlug,
  filterKey,
  categories,
  items,
  total,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  initialId,
  addressId,
  notFound,
  pane,
  onPane,
  onSettle,
  header,
  keysEnabled,
}: BrowseStackProps): ReactElement {
  const container = useRef<HTMLDivElement>(null);
  const [startId] = useState(initialId);
  const pagesKey = useMemo(() => items.map((item) => item.id).join(' '), [items]);
  const { currentId, settledId } = useCurrentCard({ container, initialId: startId, pagesKey });
  const found = items.findIndex((item) => item.id === currentId);
  const index = found >= 0 ? found : 0;
  const current = items[index];

  // The notice stays until the reader moves off the card it opened on.
  const [notice, setNotice] = useState(notFound ? startId : null);
  if (notice !== null && current && current.id !== notice) setNotice(null);

  usePrefetchAhead({
    currentIndex: index,
    loaded: items.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  useLayoutEffect(() => {
    scrollToPage(container.current, startId, 'instant');
  }, [startId]);

  const currentRef = useRef(current?.id);
  useEffect(() => {
    currentRef.current = current?.id;
  }, [current]);

  useEffect(() => {
    // Rotation/resize changes the page height: snap back onto the card being read.
    const onResize = () => {
      if (currentRef.current) scrollToPage(container.current, currentRef.current, 'instant');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!settledId || settledId === addressId) return;
    // Opened on the first card with no `i` (category change): the address stays clean.
    if (addressId === undefined && settledId === startId) return;
    onSettle(settledId);
  }, [settledId, addressId, startId, onSettle]);

  const currentItemId = current?.id;
  useEffect(() => {
    if (!currentItemId) return;
    writeBrowseReturn({ deckSlug, filterKey, itemId: currentItemId });
    focusTitle(container.current, currentItemId);
  }, [deckSlug, filterKey, currentItemId]);

  const prevId = items[index - 1]?.id;
  const nextId = items[index + 1]?.id;
  const goTo = useCallback(
    (id: string) => scrollToPage(container.current, id, pagingBehavior()),
    [],
  );
  const prevCard = useMemo(() => (prevId ? () => goTo(prevId) : null), [goTo, prevId]);
  const nextCard = useMemo(() => (nextId ? () => goTo(nextId) : null), [goTo, nextId]);
  const keys = useMemo(
    () => ({ 'next-card': () => nextCard?.(), 'prev-card': () => prevCard?.() }),
    [nextCard, prevCard],
  );
  useBrowseKeys(keys, keysEnabled);

  return (
    <>
      <div className="browse__pages" ref={container}>
        {items.map((item, i) => (
          <BrowsePage
            key={item.id}
            item={item}
            deckSlug={deckSlug}
            categories={categories}
            pane={pane}
            onPane={onPane}
            current={i === index}
            mounted={Math.abs(i - index) <= 1}
            header={{
              ...header,
              position: { index: i, total },
              onPrevCard: i === index ? prevCard : null,
            }}
            onNextCard={i === index ? nextCard : null}
          />
        ))}
      </div>
      {notice !== null && (
        <p className="browse__notice" role="status">
          {NOT_FOUND_COPY}
        </p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {current ? `Card ${positionLabel(index, total)}` : ''}
      </p>
    </>
  );
}
