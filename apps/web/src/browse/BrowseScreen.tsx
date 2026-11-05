import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { categoriesQuery } from '../api/queries';
import type { BrowseLayer } from './browse-layer';
import { filterFromCategory, type BrowseSearch } from './browse-params';
import { BrowseCards } from './BrowseCards';
import { BrowseDock } from './BrowseDock';
import type { StackCurrent } from './BrowseStack';
import { bannerText, categoryAnnouncement, CategoryBanner, useBanner } from './CategoryBanner';
import { knownCategoryTotal } from './category-counts';
import { categoryCycle, resolveCategory, stepCategory, type CycleEntry } from './category-cycle';
import { CategoryList } from './CategoryList';
import { CategoryTrack } from './CategoryTrack';
import { DetectionProvider } from './detect/detection';
import { endTitle } from './EndPage';
import { FirstRunHint } from './FirstRunHint';
import { FullView } from './FullView';
import { dismissHint, shouldShowHint } from './hint-store';
import { positionLabel, TopBar } from './TopBar';
import { useBrowseKeys } from './use-browse-keys';
import { useCategoryTrack } from './use-category-track';
import { cardTarget } from './card-target';
import { useEndPull } from './use-end-pull';
import './browse.css';

export interface BrowseScreenProps {
  deckSlug: string;
  search: BrowseSearch;
  /** Replaces the address (card and category changes). */
  onChange: (next: BrowseSearch) => void;
  /** Leaves for the list of `c`. */
  onClose: (c: string) => void;
  /** The open layer, from the history entry (D332). */
  layer: BrowseLayer | null;
  /** Pushes a history entry with the layer open. */
  onLayer: (layer: BrowseLayer) => void;
  /** Goes back off the layer's entry. */
  onCloseLayer: () => void;
}

/** The polite live text: a category change while its banner shows, else the card (contract §3). */
function liveText(
  banner: ReturnType<typeof useBanner>['banner'],
  current: StackCurrent | null,
  shown: CycleEntry,
): string {
  if (banner) {
    return banner.kind === 'category'
      ? categoryAnnouncement(banner.entry, banner.count)
      : bannerText(banner);
  }
  if (!current) return '';
  return current.atEnd ? endTitle(shown) : `Card ${positionLabel(current.index, current.total)}`;
}

/**
 * D325–D337: the Browse screen — a sideways track of categories, each a vertical track of
 * cards; the top bar, banner and dock float over it. Pure props, so the route owns navigation
 * and the layers (category list, full view) live in history entries.
 */
export function BrowseScreen({
  deckSlug,
  search,
  onChange,
  onClose,
  layer,
  onLayer,
  onCloseLayer,
}: BrowseScreenProps): ReactElement {
  const queryClient = useQueryClient();
  const categories = useQuery(categoriesQuery(deckSlug));
  const cycle = useMemo(() => categoryCycle(categories.data ?? []), [categories.data]);
  // Until categories load, trust the address; then an unknown slug falls back to All.
  const c = categories.data ? resolveCategory(cycle, search.c) : search.c;
  const entries = useMemo<CycleEntry[]>(
    () =>
      categories.data ? cycle : [cycle.find((entry) => entry.slug === c) ?? { slug: c, name: c }],
    [categories.data, cycle, c],
  );
  const entryOf = useCallback(
    (slug: string): CycleEntry =>
      entries.find((entry) => entry.slug === slug) ?? { slug, name: slug },
    [entries],
  );

  const [hint, setHint] = useState(() => shouldShowHint());
  const [current, setCurrent] = useState<StackCurrent | null>(null);
  const { banner, show } = useBanner();
  const track = useRef<HTMLDivElement>(null);
  const listButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (c !== search.c) onChange({ c });
  }, [c, search.c, onChange]);

  const onArrive = useCallback(
    (slug: string, itemId: string | undefined) => {
      onChange(itemId ? { c: slug, i: itemId } : { c: slug });
      show({
        kind: 'category',
        entry: entryOf(slug),
        count: knownCategoryTotal(queryClient, deckSlug, slug),
      });
    },
    [onChange, show, entryOf, queryClient, deckSlug],
  );
  const {
    shown,
    visits,
    pending: pendingCards,
    jumpTo,
    step,
  } = useCategoryTrack({
    track,
    entries,
    c,
    onArrive,
  });
  const shownEntry = entryOf(shown);

  const showEnd = useCallback(
    (direction: 'next' | 'prev') => show({ kind: 'end', direction }),
    [show],
  );
  useEndPull(track, {
    hasPrev: stepCategory(entries, shown, 'prev') !== null,
    hasNext: stepCategory(entries, shown, 'next') !== null,
    onEnd: showEnd,
  });

  // Layers close through history; what a pick asked for runs once the layer is gone.
  const closing = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    closing.current = false;
    if (layer !== null) return;
    const run = pending.current;
    pending.current = null;
    run?.();
  }, [layer]);
  const closeLayer = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    onCloseLayer();
  }, [onCloseLayer]);
  const closeLayerThen = useCallback(
    (then: () => void) => {
      pending.current = then;
      closeLayer();
    },
    [closeLayer],
  );

  const canOpenFull = current !== null && !current.atEnd;
  const openFull = useCallback(() => {
    if (layer === null && canOpenFull) onLayer('full');
  }, [layer, canOpenFull, onLayer]);
  const openList = useCallback(() => {
    if (layer === null) onLayer('categories');
  }, [layer, onLayer]);
  const close = useCallback(() => onClose(c), [onClose, c]);

  const keys = useMemo(() => {
    if (layer === 'full') return { close: closeLayer };
    // The category list is a native modal: it handles Escape itself.
    if (layer !== null) return {};
    return {
      'next-category': () => {
        if (!step('next')) showEnd('next');
      },
      'prev-category': () => {
        if (!step('prev')) showEnd('prev');
      },
      'full-view': openFull,
      close,
    };
  }, [layer, closeLayer, step, showEnd, openFull, close]);
  useBrowseKeys(keys, !hint);

  const settle = useCallback(
    (slug: string, itemId: string) => onChange({ c: slug, i: itemId }),
    [onChange],
  );

  const dismiss = () => {
    dismissHint();
    setHint(false);
  };

  return (
    <DetectionProvider>
      <div className="browse">
        <div className="browse__stage" inert={hint || layer !== null}>
          <CategoryTrack
            track={track}
            entries={entries}
            shown={shown}
            renderPage={(entry, active) => (
              <BrowseCards
                key={`${entry.slug}:${visits[entry.slug] ?? 0}`}
                deckSlug={deckSlug}
                filter={filterFromCategory(entry.slug)}
                categories={categories.data ?? []}
                targetId={cardTarget(entry.slug, { c, i: search.i }, pendingCards)}
                category={entry.slug}
                onSettle={settle}
                onCurrent={setCurrent}
                onOpenFull={openFull}
                end={{
                  current: entry,
                  nextCategory: stepCategory(entries, entry.slug, 'next'),
                  onCategory: (slug) => jumpTo(slug),
                  onClose: close,
                }}
                active={active}
                keysEnabled={!hint && layer === null}
              />
            )}
          />
          <TopBar
            current={shownEntry}
            onOpenList={openList}
            onClose={close}
            position={current}
            listButton={listButton}
          />
          <CategoryBanner banner={banner} onOpenList={openList} />
          {current && !current.atEnd && (
            <BrowseDock
              item={current.item}
              deckSlug={deckSlug}
              onPrevCard={current.prevCard}
              onNextCard={current.nextCard}
              onOpenFull={openFull}
            />
          )}
          <p className="visually-hidden" aria-live="polite">
            {liveText(banner, current, shownEntry)}
          </p>
        </div>
        {layer === 'categories' && (
          <CategoryList
            entries={entries}
            current={shown}
            countOf={(slug) => knownCategoryTotal(queryClient, deckSlug, slug)}
            onPick={(slug) => closeLayerThen(() => jumpTo(slug))}
            onClose={closeLayer}
          />
        )}
        {layer === 'full' && current && !current.atEnd && (
          <FullView
            item={current.item}
            deckSlug={deckSlug}
            categories={categories.data ?? []}
            onClose={closeLayer}
            onCategory={(slug) => {
              const itemId = current.item.id;
              closeLayerThen(() => jumpTo(slug, itemId));
            }}
          />
        )}
        {hint && <FirstRunHint onDismiss={dismiss} />}
      </div>
    </DetectionProvider>
  );
}
