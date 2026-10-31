import type { ReactElement } from 'react';
import type { Category, Item } from '@gobbit/shared';
import { itemCategories } from '../../cards/Card';
import { EntityChips } from '../../cards/EntityChips';
import { itemTypeLabel } from '../source-kind';
import { SectionFrame } from './SectionFrame';

export const NO_DETAILS_COPY = 'No details found for this card.';

function hasEntities(entities: Item['entities']): boolean {
  return Object.values(entities).some((values) => (values?.length ?? 0) > 0);
}

/** D246: the extracted details, the categories and the card type, under the card. */
export function CardDetails({
  item,
  categories,
}: {
  item: Item;
  categories: readonly Category[];
}): ReactElement {
  const names = itemCategories(item, categories).map((category) => category.name);
  return (
    <SectionFrame id={`browse-details-${item.id}`} title="Details">
      {hasEntities(item.entities) ? (
        <EntityChips entities={item.entities} />
      ) : (
        <p className="card-muted">{NO_DETAILS_COPY}</p>
      )}
      <dl className="browse-section__facts">
        <dt>Categories</dt>
        <dd dir="auto">{names.length > 0 ? names.join(', ') : 'None'}</dd>
        <dt>Type</dt>
        <dd>{itemTypeLabel(item.type)}</dd>
      </dl>
    </SectionFrame>
  );
}
