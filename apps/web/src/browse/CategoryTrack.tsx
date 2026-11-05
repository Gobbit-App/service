import type { ReactElement, ReactNode, RefObject } from 'react';
import type { CycleEntry } from './category-cycle';

/** The category page attribute the sideways observer reads (D325). */
export const CATEGORY_ATTR = 'data-category';

/**
 * D325/D328: the sideways snap track, one page per cycle entry. Only the shown category and
 * its neighbours render their cards; the rest are empty pages that keep the track's width.
 * Every page but the shown one is `inert`. The track is always `ltr`, so "next" is to the
 * right whatever the text direction.
 */
export function CategoryTrack({
  track,
  entries,
  shown,
  renderPage,
}: {
  track: RefObject<HTMLDivElement | null>;
  entries: readonly CycleEntry[];
  /** The category on screen. */
  shown: string;
  renderPage: (entry: CycleEntry, active: boolean) => ReactNode;
}): ReactElement {
  const index = entries.findIndex((entry) => entry.slug === shown);
  // The pages read in the document's direction; only the track's order is fixed.
  const pageDir = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
  return (
    <div className="browse__categories" ref={track} dir="ltr">
      {entries.map((entry, i) => {
        const active = i === index;
        const mounted = index >= 0 && Math.abs(i - index) <= 1;
        return (
          <section
            key={entry.slug}
            className="browse-cat"
            {...{ [CATEGORY_ATTR]: entry.slug }}
            aria-label={entry.name}
            dir={pageDir}
            aria-hidden={active ? undefined : true}
            inert={!active}
          >
            {mounted ? renderPage(entry, active) : null}
          </section>
        );
      })}
    </div>
  );
}
