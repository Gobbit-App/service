import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { stepCategory, type CycleEntry } from './category-cycle';
import { CATEGORY_ATTR } from './CategoryTrack';
import { pagingBehavior, scrollToPage } from './motion';
import { useCurrentCard } from './use-current-card';

export interface CategoryTrackState {
  /** The category on screen (it leads the address while a swipe settles). */
  shown: string;
  /** Bumped when the reader leaves or jumps into a category: its stack remounts fresh (D328). */
  visits: Readonly<Record<string, number>>;
  /** The card a jump asked for in `slug`, until the reader swipes away from it. */
  jumpTargets: Readonly<Record<string, string | undefined>>;
  /** D328: straight to `slug` (and its card `itemId`), with no sideways animation. */
  jumpTo: (slug: string, itemId?: string) => void;
  /** Animates to the neighbour; false when there is none (the caller shows the end banner). */
  step: (direction: 'next' | 'prev') => boolean;
}

/** Takes the ref (not the element) so callbacks depend on `track`, not on `track.current`. */
function scrollTo(
  track: RefObject<HTMLElement | null>,
  slug: string,
  behavior: ScrollBehavior,
): void {
  scrollToPage(track.current, slug, behavior, { axis: 'x', attr: CATEGORY_ATTR });
}

const bump = (prev: Readonly<Record<string, number>>, ...slugs: string[]) =>
  Object.fromEntries([
    ...Object.entries(prev),
    ...slugs.map((slug) => [slug, (prev[slug] ?? 0) + 1] as const),
  ]);

/**
 * D325/D328: the sideways category track. The observer reports the category on screen; once a
 * swipe settles the reader has arrived (`onArrive(slug)`). A jump moves the observer, the
 * track and the address at once, so it never reads as a swipe.
 */
export function useCategoryTrack({
  track,
  entries,
  c,
  onArrive,
}: {
  track: RefObject<HTMLDivElement | null>;
  entries: readonly CycleEntry[];
  /** The address's category. */
  c: string;
  onArrive: (slug: string, itemId: string | undefined) => void;
}): CategoryTrackState {
  const pagesKey = entries.map((entry) => entry.slug).join(' ');
  const { currentId, settledId, force } = useCurrentCard({
    container: track,
    initialId: c,
    pagesKey,
    attr: CATEGORY_ATTR,
  });
  const known = (slug: string | null): slug is string =>
    slug !== null && entries.some((entry) => entry.slug === slug);
  const shown = known(currentId) ? currentId : c;

  const [visits, setVisits] = useState<Record<string, number>>({});
  const [jumpTargets, setJumpTargets] = useState<Record<string, string | undefined>>({});

  const latest = useRef({ c, currentId, onArrive });
  useEffect(() => {
    latest.current = { c, currentId, onArrive };
  }, [c, currentId, onArrive]);

  // A swipe settled on another category: the reader arrived there (once per settle).
  const handled = useRef(settledId);
  useEffect(() => {
    if (settledId === handled.current) return;
    handled.current = settledId;
    const left = latest.current.c;
    if (!known(settledId) || settledId === left) return;
    setVisits((prev) => bump(prev, left));
    setJumpTargets((prev) => ({ ...prev, [left]: undefined }));
    latest.current.onArrive(settledId, undefined);
    // `known` reads `entries`, which only matter once the settle changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledId]);

  const jumpTo = useCallback(
    (slug: string, itemId?: string) => {
      const from = latest.current.c;
      if (slug === from) return;
      setJumpTargets((prev) => ({ ...prev, [slug]: itemId }));
      setVisits((prev) => bump(prev, slug, from));
      handled.current = slug;
      force(slug);
      scrollTo(track, slug, 'instant');
      latest.current.onArrive(slug, itemId);
    },
    [force, track],
  );

  // The address moved on its own (an unknown slug fell back to All, history): follow it.
  useEffect(() => {
    if (latest.current.currentId === c) return;
    handled.current = c;
    force(c);
    scrollTo(track, c, 'instant');
  }, [c, force, track]);

  // New pages (categories loaded) or a new size: snap back onto the category on screen.
  const shownRef = useRef(shown);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);
  useLayoutEffect(() => {
    scrollTo(track, shownRef.current, 'instant');
  }, [pagesKey, track]);
  useEffect(() => {
    const onResize = () => scrollTo(track, shownRef.current, 'instant');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [track]);

  const step = useCallback(
    (direction: 'next' | 'prev') => {
      const next = stepCategory(entries, shownRef.current, direction);
      if (!next) return false;
      scrollTo(track, next.slug, pagingBehavior());
      return true;
    },
    [entries, track],
  );

  return { shown, visits, jumpTargets, jumpTo, step };
}
