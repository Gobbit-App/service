import { useId, useRef, type KeyboardEvent, type ReactElement } from 'react';
import { Button } from '../ui/buttons/Button';
import { IconButton } from '../ui/buttons/IconButton';
import { Sheet } from '../ui/sheet/Sheet';
import type { CycleEntry } from './category-cycle';
import { cardCountLabel } from './category-counts';

/** The row a roving key moves to, or null for keys the list doesn't handle. */
export function rovingTarget(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return Math.min(count - 1, index + 1);
    case 'ArrowUp':
      return Math.max(0, index - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * D332: every category with its card count (when known), the current one marked. Picking one
 * jumps there; Escape, the Close button, a tap outside or system back close it unchanged.
 * Drawn with the app's one sheet (a native modal dialog, D304).
 */
export function CategoryList({
  entries,
  current,
  countOf,
  onPick,
  onClose,
}: {
  entries: readonly CycleEntry[];
  current: string;
  countOf: (slug: string) => number | null;
  onPick: (slug: string) => void;
  onClose: () => void;
}): ReactElement {
  const titleId = useId();
  const currentRow = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const rows = Array.from(list.current?.querySelectorAll('button') ?? []);
    const from = rows.findIndex((row) => row === document.activeElement);
    const to = rovingTarget(event.key, from < 0 ? 0 : from, rows.length);
    if (to === null) return;
    event.preventDefault();
    rows[to]?.focus();
  };

  return (
    <Sheet labelledBy={titleId} onClose={onClose} initialFocus={currentRow} className="browse-list">
      <div className="browse-list__head">
        <h2 className="browse-list__title" id={titleId}>
          Categories
        </h2>
        <IconButton icon="close" label="Close categories" onClick={onClose} />
      </div>
      <ul className="browse-list__rows" ref={list} onKeyDown={onKeyDown}>
        {entries.map((entry) => {
          const isCurrent = entry.slug === current;
          const count = countOf(entry.slug);
          return (
            <li key={entry.slug} className="browse-list__row">
              <Button
                ref={isCurrent ? currentRow : undefined}
                icon={isCurrent ? 'check' : 'browse'}
                label={entry.name}
                aria-label={count === null ? entry.name : `${entry.name}, ${cardCountLabel(count)}`}
                aria-current={isCurrent ? 'true' : undefined}
                variant="ghost"
                className="browse-list__pick"
                dir="auto"
                onClick={() => onPick(entry.slug)}
              />
              {count !== null && (
                <span className="browse-list__count" aria-hidden="true">
                  {count}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
