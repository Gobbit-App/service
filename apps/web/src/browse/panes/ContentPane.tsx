import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { Category, Item } from '@gobbit/shared';
import { deckQuery } from '../../api/queries';
import { Card } from '../../cards/Card';
import { CardActionBar } from '../../cards/CardActionBar';
import type { ImageLoading } from '../../cards/ImageCard';

/**
 * FR-016: the card itself, as in the list: its action bar (Edit, favorite, share, more; D213)
 * and the title link to the card page.
 */
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
  const role = useQuery(deckQuery(deckSlug)).data?.role;
  return (
    <Card
      item={item}
      deckSlug={deckSlug}
      categories={categories}
      image={image}
      actions={role && <CardActionBar item={item} deckSlug={deckSlug} role={role} />}
    />
  );
}
