import type { Item } from '@gobbit/shared';
import type { ReactElement, ReactNode } from 'react';
import { useToggleFavorite } from '../api/favorites';
import { FavoriteButton } from '../ui/FavoriteButton';
import { ShareButton } from '../ui/ShareButton';

/** D213: the card's action bar, the last row inside the card. */
export function CardBar({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="card__bar" role="group" aria-label="Card actions">
      {children}
    </div>
  );
}

/** Favorite toggle wired to the favorites mutation. */
export function CardFavorite({ item }: { item: Item }): ReactElement {
  const toggle = useToggleFavorite();
  return (
    <FavoriteButton
      isFavorite={item.isFavorite}
      disabled={toggle.isPending}
      onToggle={() => toggle.mutate({ itemId: item.id, isFavorite: !item.isFavorite })}
    />
  );
}

/** What every reader gets: Favorite and Share. */
export function ReaderActions({ item }: { item: Item }): ReactElement {
  return (
    <>
      <CardFavorite item={item} />
      <ShareButton itemId={item.id} title={item.title} />
    </>
  );
}
