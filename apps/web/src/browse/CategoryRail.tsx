import { useLayoutEffect, useRef, type ReactElement } from 'react';
import type { CycleEntry } from './category-cycle';

/** Left offset that puts `chip` in the middle of `rail` (clamped by the browser). */
export function centeredOffset(
  rail: Pick<HTMLElement, 'clientWidth'>,
  chip: Pick<HTMLElement, 'offsetLeft' | 'offsetWidth'>,
): number {
  return Math.max(0, chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2);
}

/**
 * D247: All + the categories in chip-row order, one tap away. The current chip carries
 * `aria-current` and is scrolled to the middle of the rail.
 */
export function CategoryRail({
  cycle,
  current,
  onSelect,
}: {
  cycle: readonly CycleEntry[];
  /** The current `c`. */
  current: string;
  onSelect: (slug: string) => void;
}): ReactElement {
  const rail = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const list = rail.current;
    if (!list) return;
    const chip = Array.from(list.querySelectorAll<HTMLElement>('[data-slug]')).find(
      (element) => element.dataset.slug === current,
    );
    if (!chip || typeof list.scrollTo !== 'function') return;
    list.scrollTo({ left: centeredOffset(list, chip), behavior: 'instant' });
  }, [current, cycle]);

  return (
    <nav className="browse-rail" aria-label="Categories">
      <ul className="browse-rail__list" ref={rail}>
        {cycle.map((entry) => {
          const isCurrent = entry.slug === current;
          return (
            <li key={entry.slug}>
              <button
                type="button"
                className="browse-rail__chip"
                data-slug={entry.slug}
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => {
                  if (!isCurrent) onSelect(entry.slug);
                }}
                dir="auto"
              >
                {entry.name}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
