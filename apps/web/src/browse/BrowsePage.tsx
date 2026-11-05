import type { PointerEvent, ReactElement } from 'react';
import type { Category, Item } from '@gobbit/shared';
import { Card } from '../cards/Card';
import { useLongPress } from '../ui/use-long-press';

export interface BrowsePageProps {
  item: Item;
  deckSlug: string;
  categories: readonly Category[];
  /** The current card: in the a11y tree, loads its image first. */
  current: boolean;
  /** Current ±1: renders its card; the rest are empty full-height placeholders (D144). */
  mounted: boolean;
  /** D334: press and hold the card to open the full view. */
  onOpenFull?: () => void;
}

/** A press on a control or a detected value is that control's, never a long press (D334). */
const OWN_PRESS = 'a, button, input, textarea, select, [data-detect]';

/**
 * D325/D327: one page of the vertical track — the card surface only (no meta row, no bar; its
 * actions live in the dock). Short cards are centred, tall ones scroll inside the page. The
 * strips at both sides allow only vertical pans, so an edge swipe never changes category (D333).
 */
export function BrowsePage({
  item,
  deckSlug,
  categories,
  current,
  mounted,
  onOpenFull,
}: BrowsePageProps): ReactElement {
  const { bind } = useLongPress(current ? onOpenFull : undefined);
  if (!mounted) {
    return <section className="browse-page" data-item-id={item.id} aria-hidden="true" inert />;
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.target instanceof Element && event.target.closest(OWN_PRESS)) return;
    bind.onPointerDown?.(event);
  };
  return (
    <section
      className="browse-page"
      data-item-id={item.id}
      aria-labelledby={`card-title-${item.id}`}
      aria-hidden={current ? undefined : true}
      inert={!current}
    >
      <div className="browse-edge browse-edge--start" aria-hidden="true" />
      <div className="browse-card" {...bind} onPointerDown={onPointerDown}>
        <Card
          item={item}
          deckSlug={deckSlug}
          categories={categories}
          image={{ priority: current }}
          actions={false}
          meta={false}
        />
      </div>
      <div className="browse-edge browse-edge--end" aria-hidden="true" />
    </section>
  );
}
