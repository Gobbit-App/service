import { useMemo, type ReactElement, type ReactNode } from 'react';
import type { Category, Item } from '@gobbit/shared';
import { cardAge } from '../lib/card-age';
import { chipHref } from '../ui/chip-order';
import { NavLink } from '../ui/NavLink';
import { CardBar, ReaderActions } from './CardBar';
import { CardBody } from './CardBody';
import type { ImageLoading } from './ImageCard';
import { Highlighted } from '../search/Highlighted';
import { useCloudName } from './use-cloud-name';

/** Category chips in item order; ids the reader can't see are absent from the map (D38). */
export function itemCategories(item: Item, categories: readonly Category[]): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return item.categoryIds.flatMap((id) => byId.get(id) ?? []);
}

/**
 * The card frame (§4): title, body, category chips, added/edited age, then the action bar
 * (D213: every action lives inside the card; default Favorite + Share).
 */
export function Card({
  item,
  deckSlug,
  categories,
  linkTitle = true,
  highlight = '',
  now = new Date(),
  preview = false,
  image,
  actions,
}: {
  item: Item;
  deckSlug: string;
  categories: readonly Category[];
  /** In a list the title opens `/i/:itemId`; on that page it is plain text. */
  linkTitle?: boolean;
  /** Search query whose words are marked in the title (D79). */
  highlight?: string;
  now?: Date;
  /** D136: the editor's preview: no favorite/share, title and chips as plain text. */
  preview?: boolean;
  /** D144: image loading hints (Browse: measured width, priority for the current card). */
  image?: ImageLoading;
  /** The card's action bar (e.g. CardActionBar); defaults to Favorite + Share. */
  actions?: ReactNode;
}): ReactElement {
  const cloudName = useCloudName();
  const chips = useMemo(() => itemCategories(item, categories), [item, categories]);
  const age = cardAge(item, now);
  const titleId = `card-title-${item.id}`;

  return (
    <article className="card" aria-labelledby={titleId}>
      <header className="card__header">
        <h2 className="card__title" id={titleId} dir="auto">
          {linkTitle && !preview ? (
            <NavLink href={`/i/${item.id}`}>
              <Highlighted text={item.title} query={highlight} />
            </NavLink>
          ) : (
            <Highlighted text={item.title} query={highlight} />
          )}
        </h2>
      </header>
      <CardBody item={item} cloudName={cloudName} image={image} />
      {(chips.length > 0 || age) && (
        <footer className="card__meta">
          {chips.length > 0 && (
            <ul className="card__chips" aria-label="Categories">
              {chips.map((c) => (
                <li key={c.id}>
                  {preview ? (
                    <span className="chip chip--small">{c.name}</span>
                  ) : (
                    <NavLink
                      className="chip chip--small"
                      href={chipHref(deckSlug, { kind: 'category', slug: c.slug })}
                    >
                      {c.name}
                    </NavLink>
                  )}
                </li>
              ))}
            </ul>
          )}
          {age && (
            <time
              className="card__age"
              dateTime={age.at.toISOString()}
              title={age.at.toLocaleString()}
            >
              {age.label}
            </time>
          )}
        </footer>
      )}
      {!preview &&
        (actions ?? (
          <CardBar>
            <ReaderActions item={item} />
          </CardBar>
        ))}
    </article>
  );
}
