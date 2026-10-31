import type { ReactElement } from 'react';
import type { Category, Item } from '@gobbit/shared';
import { Card } from '../cards/Card';
import { CardDetails } from './sections/CardDetails';
import { CardSource } from './sections/CardSource';

export interface BrowsePageProps {
  item: Item;
  deckSlug: string;
  categories: readonly Category[];
  /** The current card: in the a11y tree, loads its image first. */
  current: boolean;
  /** Current ±1: renders its card; the rest are empty full-width placeholders (D144). */
  mounted: boolean;
}

/**
 * D244/D246: one page of the horizontal track. It scrolls vertically on its own: the card,
 * then its Details and Source. Its actions live in the dock (D249), so the card has no bar.
 */
export function BrowsePage({
  item,
  deckSlug,
  categories,
  current,
  mounted,
}: BrowsePageProps): ReactElement {
  if (!mounted) {
    return <section className="browse-page" data-item-id={item.id} aria-hidden="true" inert />;
  }
  return (
    <section
      className="browse-page"
      data-item-id={item.id}
      aria-labelledby={`card-title-${item.id}`}
      aria-hidden={current ? undefined : true}
      inert={!current}
    >
      <div className="browse-sheet">
        <Card
          item={item}
          deckSlug={deckSlug}
          categories={categories}
          image={{ priority: current }}
          actions={false}
        />
        <CardDetails item={item} categories={categories} />
        <CardSource item={item} />
      </div>
    </section>
  );
}
