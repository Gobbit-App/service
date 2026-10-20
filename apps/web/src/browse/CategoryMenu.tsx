import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import type { CycleEntry } from './category-cycle';

function focusItem(menu: HTMLElement | null, index: number): void {
  const items = menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
  if (!items || items.length === 0) return;
  const clamped = (index + items.length) % items.length;
  items[clamped]?.focus();
}

/** Contract §3 "Pick a category": the category name opens a menu of All + the categories. */
export function CategoryMenu({
  cycle,
  current,
  onSelect,
  disabled = false,
}: {
  cycle: readonly CycleEntry[];
  current: CycleEntry;
  onSelect: (slug: string) => void;
  disabled?: boolean;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const checkedIndex = Math.max(
    0,
    cycle.findIndex((entry) => entry.slug === current.slug),
  );

  useEffect(() => {
    if (!open) return;
    focusItem(menu.current, checkedIndex);
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, checkedIndex]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      event.stopPropagation();
      focusItem(menu.current, moves[event.key] ?? 0);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div className="browse-category" ref={root}>
      <button
        ref={button}
        type="button"
        className="browse-category__name"
        aria-label={`Category: ${current.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
        dir="auto"
      >
        {current.name}
      </button>
      {open && (
        <ul
          ref={menu}
          id={menuId}
          className="browse-category__menu"
          role="menu"
          aria-label="Categories"
          onKeyDown={onMenuKeyDown}
        >
          {cycle.map((entry) => (
            <li key={entry.slug} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={entry.slug === current.slug}
                tabIndex={-1}
                dir="auto"
                onClick={() => {
                  close(true);
                  if (entry.slug !== current.slug) onSelect(entry.slug);
                }}
              >
                {entry.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
