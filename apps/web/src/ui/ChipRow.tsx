import type { ReactElement, MouseEvent } from 'react';
import { useEffect, useRef } from 'react';
import type { Category } from '@pb/shared';
import { chipHref, orderChips, sameView, type ChipView } from './chip-order';

/** Renders a row of category chips for navigation. */
export function ChipRow(props: {
  deckSlug: string;
  categories: readonly Category[];
  active: ChipView;
  showArchived: boolean;
  onNavigate: (href: string) => void;
}): ReactElement {
  const navRef = useRef<HTMLElement>(null);

  const views: ChipView[] = [
    { kind: 'all' },
    { kind: 'favorites' },
    ...orderChips(props.categories).map((cat) => ({
      kind: 'category' as const,
      slug: cat.slug,
    })),
  ];

  if (props.showArchived) {
    views.push({ kind: 'archived' });
  }

  useEffect(() => {
    if (!navRef.current) return;
    const activeElement = navRef.current.querySelector(
      '[aria-current="page"]',
    ) as HTMLElement | null;
    activeElement?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [props.active]);

  const handleChipClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    props.onNavigate(href);
  };

  return (
    <nav ref={navRef} className="chip-row" aria-label="Categories">
      <ul className="chip-row__list">
        {views.map((view) => {
          const href = chipHref(props.deckSlug, view);
          let label: string;

          if (view.kind === 'all') {
            label = 'All';
          } else if (view.kind === 'favorites') {
            label = 'Favorites';
          } else if (view.kind === 'archived') {
            label = 'Archived';
          } else {
            const category = props.categories.find((c) => c.slug === view.slug);
            label = category?.name ?? view.slug;
          }

          return (
            <li key={view.kind === 'category' ? `category-${view.slug}` : view.kind}>
              <a
                className="chip"
                href={href}
                aria-current={sameView(view, props.active) ? 'page' : undefined}
                dir="auto"
                onClick={(e) => handleChipClick(e, href)}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
