import type { ReactElement } from 'react';
import { Button } from '../ui/buttons/Button';
import { ALL_CATEGORIES } from './browse-params';
import type { CycleEntry } from './category-cycle';

/** The end page's marker on the track (never an item id: the observer reports it as is). */
export const END_PAGE_ID = 'browse:end';
export const END_TITLE_ID = 'browse-end-title';

/** "That's all in Food"; for All, "You've seen every card". */
export function endTitle(current: CycleEntry): string {
  return current.slug === ALL_CATEGORIES
    ? "You've seen every card"
    : `That's all in ${current.name}`;
}

/**
 * D248: one page after the last card. It is not an item: the address and the return entry
 * keep the last card. Offers the next category (if any) and the way back to the list.
 */
export function EndPage({
  current,
  nextCategory,
  onCategory,
  onClose,
  active,
}: {
  current: CycleEntry;
  nextCategory: CycleEntry | null;
  onCategory: (slug: string) => void;
  onClose: () => void;
  /** In the a11y tree only while it is the visible page. */
  active: boolean;
}): ReactElement {
  return (
    <section
      className="browse-page browse-page--end"
      data-item-id={END_PAGE_ID}
      aria-labelledby={END_TITLE_ID}
      aria-hidden={active ? undefined : true}
      inert={!active}
    >
      <div className="browse-end">
        <h2 className="browse-end__title" id={END_TITLE_ID} dir="auto">
          {endTitle(current)}
        </h2>
        <div className="browse-end__actions">
          {nextCategory && (
            <Button
              icon="forward"
              label={`Continue to ${nextCategory.name}`}
              onClick={() => onCategory(nextCategory.slug)}
            />
          )}
          <Button icon="list" label="Back to the list" variant="ghost" onClick={onClose} />
        </div>
      </div>
    </section>
  );
}
