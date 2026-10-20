import type { ReactElement } from 'react';
import type { Category, Item } from '@pb/shared';
import { Card } from '../../cards/Card';
import type { ImageLoading } from '../../cards/ImageCard';

/** FR-016: the card itself, as in the list: favorite, share and the title link to the card page. */
export function ContentPane({
  item,
  deckSlug,
  categories,
  image,
}: {
  item: Item;
  deckSlug: string;
  categories: readonly Category[];
  image?: ImageLoading;
}): ReactElement {
  return <Card item={item} deckSlug={deckSlug} categories={categories} image={image} />;
}
