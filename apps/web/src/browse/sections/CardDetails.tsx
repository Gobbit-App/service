import type { ReactElement } from 'react';
import type { Category, Item } from '@gobbit/shared';
import { itemCategories } from '../../cards/Card';
import { EntityChips } from '../../cards/EntityChips';
import { Button } from '../../ui/buttons/Button';
import { itemTypeLabel } from '../source-kind';
import { SectionFrame } from './SectionFrame';

export const NO_DETAILS_COPY = 'No details found for this card.';

function hasEntities(entities: Item['entities']): boolean {
  return Object.values(entities).some((values) => (values?.length ?? 0) > 0);
}

function CategoryNames({
  names,
  onCategory,
}: {
  names: readonly Category[];
  onCategory?: (slug: string) => void;
}): ReactElement {
  if (names.length === 0) return <>None</>;
  if (!onCategory) return <>{names.map((category) => category.name).join(', ')}</>;
  return (
    <span className="browse-section__categories">
      {names.map((category) => (
        <Button
          key={category.id}
          icon="browse"
          label={category.name}
          aria-label={`Browse ${category.name}`}
          variant="ghost"
          className="browse-section__category"
          onClick={() => onCategory(category.slug)}
        />
      ))}
    </span>
  );
}

/**
 * D246: the extracted details, the categories and the card type, under the card. In the full
 * view each category is a button that browses it (D336).
 */
export function CardDetails({
  item,
  categories,
  onCategory,
}: {
  item: Item;
  categories: readonly Category[];
  onCategory?: (slug: string) => void;
}): ReactElement {
  const names = itemCategories(item, categories);
  return (
    <SectionFrame id={`browse-details-${item.id}`} title="Details">
      {hasEntities(item.entities) ? (
        <EntityChips entities={item.entities} />
      ) : (
        <p className="card-muted">{NO_DETAILS_COPY}</p>
      )}
      <dl className="browse-section__facts">
        <dt>Categories</dt>
        <dd dir="auto">
          <CategoryNames names={names} onCategory={onCategory} />
        </dd>
        <dt>Type</dt>
        <dd>{itemTypeLabel(item.type)}</dd>
      </dl>
    </SectionFrame>
  );
}
