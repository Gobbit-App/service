import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { categoriesQuery } from '../api/queries';
import { filterFromCategory, type BrowsePane, type BrowseSearch } from './browse-params';
import { BrowseCards } from './BrowseCards';
import { categoryCycle, resolveCategory, stepCategory, type CycleEntry } from './category-cycle';
import { FirstRunHint } from './FirstRunHint';
import { dismissHint, shouldShowHint } from './hint-store';
import { useBrowseKeys } from './use-browse-keys';
import './browse.css';

/**
 * D139–D141: the Browse screen. Pure props, so the route owns navigation: `onChange` replaces
 * the address, `onClose(c)` leaves for the list of `c`.
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
  const current: CycleEntry = cycle.find((entry) => entry.slug === c) ?? { slug: c, name: c };
  const [hint, setHint] = useState(() => shouldShowHint());

  useEffect(() => {
    if (c !== search.c) onChange({ c, pane: search.pane });
  }, [c, search.c, search.pane, onChange]);

  const onCategory = useCallback(
    (slug: string) => onChange({ c: slug, pane: search.pane }),
    [onChange, search.pane],
  );
  const onPane = useCallback(
    (pane: BrowsePane) => onChange({ ...search, c, pane }),
    [onChange, search, c],
  );
  const onSettle = useCallback((i: string) => onChange({ ...search, c, i }), [onChange, search, c]);
  const close = useCallback(() => onClose(c), [onClose, c]);

  const prevCategory = stepCategory(cycle, c, 'prev');
  const nextCategory = stepCategory(cycle, c, 'next');
  const keys = useMemo(
    () => ({
      'next-category': () => nextCategory && onCategory(nextCategory.slug),
      'prev-category': () => prevCategory && onCategory(prevCategory.slug),
      close,
    }),
    [nextCategory, prevCategory, onCategory, close],
  );
  useBrowseKeys(keys, !hint);

  const dismiss = () => {
    dismissHint();
    setHint(false);
  };

  return (
    <div className="browse">
      <div className="browse__stage" inert={hint}>
        <BrowseCards
          key={c}
          deckSlug={deckSlug}
          filter={filterFromCategory(c)}
          categories={categories.data ?? []}
          targetId={search.i}
          pane={search.pane}
          onPane={onPane}
          onSettle={onSettle}
          header={{ cycle, current, prevCategory, nextCategory, onCategory, onClose: close }}
          keysEnabled={!hint}
        />
      </div>
      {hint && <FirstRunHint onDismiss={dismiss} />}
    </div>
  );
}
