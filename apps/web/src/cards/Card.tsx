import { useMemo, type ReactElement } from 'react';
import type { Category, Item } from '@pb/shared';
import { useToggleFavorite } from '../api/favorites';
import { checkedAgo } from '../lib/relative-time';
import { chipHref } from '../ui/chip-order';
import { FavoriteButton } from '../ui/FavoriteButton';
import { NavLink } from '../ui/NavLink';
import { ShareButton } from '../ui/ShareButton';
import { CardBody } from './CardBody';
import { useCloudName } from './use-cloud-name';

/** Category chips in item order; ids the reader can't see are absent from the map (D38). */
export function itemCategories(item: Item, categories: readonly Category[]): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return item.categoryIds.flatMap((id) => byId.get(id) ?? []);
}

/** The card frame (§4): title, body, category chips, checked-ago, favorite and share. */
export function Card({
  item,
  deckSlug,
  categories,
  linkTitle = true,
  now = new Date(),
}: {
  item: Item;
  deckSlug: string;
  categories: readonly Category[];
  /** In a list the title opens `/i/:itemId`; on that page it is plain text. */
  linkTitle?: boolean;
  now?: Date;
}): ReactElement {
  const cloudName = useCloudName();
  const toggle = useToggleFavorite();
  const chips = useMemo(() => itemCategories(item, categories), [item, categories]);
  const checked = checkedAgo(item.verifiedAt, now);
  const titleId = `card-title-${item.id}`;

  return (
    <article className="card" aria-labelledby={titleId}>
      <header className="card__header">
        <h2 className="card__title" id={titleId} dir="auto">
          {linkTitle ? <NavLink href={`/i/${item.id}`}>{item.title}</NavLink> : item.title}
        </h2>
        <div className="card__actions">
          <FavoriteButton
            isFavorite={item.isFavorite}
            disabled={toggle.isPending}
            onToggle={() => toggle.mutate({ itemId: item.id, isFavorite: !item.isFavorite })}
          />
          <ShareButton itemId={item.id} title={item.title} />
        </div>
      </header>
      <CardBody item={item} cloudName={cloudName} />
      {(chips.length > 0 || checked) && (
        <footer className="card__meta">
          {chips.length > 0 && (
            <ul className="card__chips" aria-label="Categories">
              {chips.map((c) => (
                <li key={c.id}>
                  <NavLink
                    className="chip chip--small"
                    href={chipHref(deckSlug, { kind: 'category', slug: c.slug })}
                  >
                    {c.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
          {checked && <span className="card__checked">{checked}</span>}
        </footer>
      )}
    </article>
  );
}
