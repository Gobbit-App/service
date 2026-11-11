import { useEffect, useRef, type ReactElement } from 'react';
import type { Category, Item } from '@gobbit/shared';
import { Card } from '../cards/Card';
import { IconButton } from '../ui/buttons/IconButton';
import { CardDetails } from './sections/CardDetails';
import { CardSource } from './sections/CardSource';

/** D335: the tail is (nearly) all on screen, so the sheet has been swiped away. */
export const SWIPE_OUT_RATIO = 0.95;

/**
 * D334/D335: the whole card over Browse — Close, the card surface, its categories (each one
 * browses it, D336), details and source. Its own vertical snap scroller ends in a transparent
 * tail; swiping the sheet up past its bottom snaps to the tail and closes it. Escape and system
 * back close it through the screen's layer.
 */
export function FullView({
  item,
  deckSlug,
  categories,
  onClose,
  onCategory,
}: {
  item: Item;
  deckSlug: string;
  categories: readonly Category[];
  onClose: () => void;
  onCategory: (slug: string) => void;
}): ReactElement {
  const scroller = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = `full-title-${item.id}`;

  useEffect(() => {
    const opener = document.activeElement;
    closeButton.current?.focus();
    return () => {
      // The stage stays inert until this layer is gone: restore focus after that render.
      setTimeout(() => {
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      }, 0);
    };
  }, []);

  useEffect(() => {
    const root = scroller.current;
    const target = tail.current;
    if (!root || !target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.intersectionRatio >= SWIPE_OUT_RATIO)) onClose();
      },
      { root, threshold: [SWIPE_OUT_RATIO] },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [onClose]);

  return (
    <div className="browse-full" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="browse-full__scroller" ref={scroller}>
        <div className="browse-full__sheet">
          <div className="browse-full__head">
            <IconButton ref={closeButton} icon="close" label="Close full view" onClick={onClose} />
          </div>
          <div className="browse-full__card">
            <Card
              item={item}
              deckSlug={deckSlug}
              categories={categories}
              linkTitle={false}
              actions={false}
              meta={false}
              source={false}
              titleId={titleId}
            />
          </div>
          <CardDetails item={item} categories={categories} onCategory={onCategory} />
          <CardSource item={item} />
        </div>
        <div className="browse-full__tail" ref={tail} aria-hidden="true" />
      </div>
    </div>
  );
}
