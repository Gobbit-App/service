import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { categoriesQuery } from '../api/queries';
import { filterFromCategory, type BrowseSearch } from './browse-params';
import { BrowseCards } from './BrowseCards';
import { categoryCycle, resolveCategory, stepCategory, type CycleEntry } from './category-cycle';
import { FirstRunHint } from './FirstRunHint';
import { dismissHint, shouldShowHint } from './hint-store';
import { TopBar, type BrowsePosition } from './TopBar';
import { useBrowseKeys } from './use-browse-keys';
import './browse.css';

/**
 * D139–D141, 034: the Browse screen — top bar, a horizontal track of cards, the dock. Pure
 * props, so the route owns navigation: `onChange` replaces the address, `onClose(c)` leaves
 * for the list of `c`.
 */
export function BrowseScreen({
  deckSlug,
  search,
  onChange,
  onClose,
}: {
  deckSlug: string;
  search: BrowseSearch;
  onChange: (next: BrowseSearch) => void;
  onClose: (c: string) => void;
}): ReactElement {
  const categories = useQuery(categoriesQuery(deckSlug));
  const cycle = useMemo(() => categoryCycle(categories.data ?? []), [categories.data]);
  // Until categories load, trust the address; then an unknown slug falls back to All.
  const c = categories.data ? resolveCategory(cycle, search.c) : search.c;
  const current: CycleEntry = useMemo(
    () => cycle.find((entry) => entry.slug === c) ?? { slug: c, name: c },
    [cycle, c],
  );
  const [hint, setHint] = useState(() => shouldShowHint());
  const [position, setPosition] = useState<BrowsePosition | null>(null);

  useEffect(() => {
    if (c !== search.c) onChange({ c });
  }, [c, search.c, onChange]);

  const onCategory = useCallback((slug: string) => onChange({ c: slug }), [onChange]);
  const onSettle = useCallback((i: string) => onChange({ c, i }), [onChange, c]);
  const close = useCallback(() => onClose(c), [onClose, c]);
  const keys = useMemo(() => ({ close }), [close]);
  useBrowseKeys(keys, !hint);

  const end = useMemo(
    () => ({
      current,
      nextCategory: stepCategory(cycle, c, 'next'),
      onCategory,
      onClose: close,
    }),
    [current, cycle, c, onCategory, close],
  );

  const dismiss = () => {
    dismissHint();
    setHint(false);
  };

  return (
    <div className="browse">
      <div className="browse__stage" inert={hint}>
        <TopBar
          cycle={cycle}
          current={c}
          onCategory={onCategory}
          onClose={close}
          position={position}
        />
        <BrowseCards
          key={c}
          deckSlug={deckSlug}
          filter={filterFromCategory(c)}
          categories={categories.data ?? []}
          targetId={search.i}
          onSettle={onSettle}
          onPosition={setPosition}
          end={end}
          keysEnabled={!hint}
        />
      </div>
      {hint && <FirstRunHint onDismiss={dismiss} />}
    </div>
  );
}
