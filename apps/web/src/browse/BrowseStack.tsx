import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { Category, Item } from '@gobbit/shared';
import { writeBrowseReturn } from './browse-return';
import { BrowseDock } from './BrowseDock';
import { BrowsePage } from './BrowsePage';
import type { CycleEntry } from './category-cycle';
import { END_PAGE_ID, END_TITLE_ID, EndPage, endTitle } from './EndPage';
import { pagingBehavior, scrollToPage } from './motion';
import { positionLabel, type BrowsePosition } from './TopBar';
import { useBrowseKeys } from './use-browse-keys';
import { usePrefetchAhead } from './use-browse-items';
import { useCurrentCard } from './use-current-card';

export const NOT_FOUND_COPY = "That card isn't available here";

/** What the end page needs to offer the next category and the way out (D248). */
export interface BrowseEndProps {
  current: CycleEntry;
  nextCategory: CycleEntry | null;
  onCategory: (slug: string) => void;
  onClose: () => void;
}

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
  onSettle: (itemId: string) => void;
  /** The top bar's counter and progress follow the current card. */
  onPosition: (position: BrowsePosition | null) => void;
  end: BrowseEndProps;
  /** Off while the first-run hint is open. */
  keysEnabled: boolean;
}

/** Focus follows the page's heading unless the reader is working elsewhere on the screen. */
function focusHeading(container: HTMLElement | null, headingId: string): void {
  const active = document.activeElement;
  const idle = !active || active === document.body;
  if (!idle && !container?.contains(active)) return;
  const title = document.getElementById(headingId);
  if (!title || title === active) return;
  title.setAttribute('tabindex', '-1');
  title.focus({ preventScroll: true });
}

/** D244: one category's cards on a horizontal snap track, tracked by id, ±1 mounted. */
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
  onSettle,
  onPosition,
  end,
  keysEnabled,
}: BrowseStackProps): ReactElement {
  const container = useRef<HTMLDivElement>(null);
  const [startId] = useState(initialId);
  const showEnd = !hasNextPage;
  const pagesKey = useMemo(
    () => items.map((item) => item.id).join(' ') + (showEnd ? ' end' : ''),
    [items, showEnd],
  );
  const { currentId, settledId } = useCurrentCard({ container, initialId: startId, pagesKey });
  const atEnd = showEnd && currentId === END_PAGE_ID;
  // On the end page the last card stays the reader's place (D248).
  const found = atEnd ? items.length - 1 : items.findIndex((item) => item.id === currentId);
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

  const visibleRef = useRef(currentId);
  useEffect(() => {
    visibleRef.current = currentId;
  }, [currentId]);

  useEffect(() => {
    // Rotation/resize changes the page width: snap back onto the page being read.
    const onResize = () => {
      if (visibleRef.current) scrollToPage(container.current, visibleRef.current, 'instant');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!settledId || settledId === END_PAGE_ID || settledId === addressId) return;
    // Opened on the first card with no `i` (category change): the address stays clean.
    if (addressId === undefined && settledId === startId) return;
    onSettle(settledId);
  }, [settledId, addressId, startId, onSettle]);

  const currentItemId = current?.id;
  useEffect(() => {
    if (!currentItemId) return;
    writeBrowseReturn({ deckSlug, filterKey, itemId: currentItemId });
  }, [deckSlug, filterKey, currentItemId]);

  useEffect(() => {
    if (!currentItemId) return;
    focusHeading(container.current, atEnd ? END_TITLE_ID : `card-title-${currentItemId}`);
  }, [currentItemId, atEnd]);

  useEffect(() => {
    onPosition({ index, total, loaded: items.length });
  }, [onPosition, index, total, items.length]);
  useEffect(() => () => onPosition(null), [onPosition]);

  const goTo = useCallback(
    (id: string) => scrollToPage(container.current, id, pagingBehavior()),
    [],
  );
  const prevId = atEnd ? current?.id : items[index - 1]?.id;
  const nextId = atEnd ? undefined : (items[index + 1]?.id ?? (showEnd ? END_PAGE_ID : undefined));
  const prevCard = useMemo(() => (prevId ? () => goTo(prevId) : null), [goTo, prevId]);
  const nextCard = useMemo(() => (nextId ? () => goTo(nextId) : null), [goTo, nextId]);
  const keys = useMemo(
    () => ({ 'next-card': () => nextCard?.(), 'prev-card': () => prevCard?.() }),
    [nextCard, prevCard],
  );
  useBrowseKeys(keys, keysEnabled);

  return (
    <>
      <div className="browse__track" ref={container}>
        {items.map((item, i) => (
          <BrowsePage
            key={item.id}
            item={item}
            deckSlug={deckSlug}
            categories={categories}
            current={!atEnd && i === index}
            mounted={Math.abs(i - index) <= 1}
          />
        ))}
        {showEnd && <EndPage {...end} active={atEnd} />}
      </div>
      {current && !atEnd && (
        <BrowseDock
          item={current}
          deckSlug={deckSlug}
          onPrevCard={prevCard}
          onNextCard={nextCard}
        />
      )}
      {notice !== null && (
        <p className="browse__notice" role="status">
          {NOT_FOUND_COPY}
        </p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {atEnd ? endTitle(end.current) : current ? `Card ${positionLabel(index, total)}` : ''}
      </p>
    </>
  );
}
