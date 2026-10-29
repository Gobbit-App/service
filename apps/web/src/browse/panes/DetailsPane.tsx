import type { ReactElement } from 'react';
import type { Category, Item } from '@gobbit/shared';
import { itemCategories } from '../../cards/Card';
import { EntityChips } from '../../cards/EntityChips';
import { itemTypeLabel } from '../source-kind';
import { PaneFrame } from './PaneFrame';

export const NO_DETAILS_COPY = 'No details found for this card.';

function hasEntities(entities: Item['entities']): boolean {
  return Object.values(entities).some((values) => (values?.length ?? 0) > 0);
}

/** Data-model §5: the extracted details, the categories and the card type. */
export function DetailsPane({
  item,
  categories,
}: {
  item: Item;
  categories: readonly Category[];
}): ReactElement {
  const names = itemCategories(item, categories).map((category) => category.name);
  return (
    <PaneFrame item={item}>
      <h3 className="browse-pane__heading">Details</h3>
      {hasEntities(item.entities) ? (
        <EntityChips entities={item.entities} />
      ) : (
        <p className="card-muted">{NO_DETAILS_COPY}</p>
      )}
      <dl className="browse-pane__facts">
        <dt>Categories</dt>
        <dd dir="auto">{names.length > 0 ? names.join(', ') : 'None'}</dd>
        <dt>Type</dt>
        <dd>{itemTypeLabel(item.type)}</dd>
      </dl>
    </PaneFrame>
  );
}
