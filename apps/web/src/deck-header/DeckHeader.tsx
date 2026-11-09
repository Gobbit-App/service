import type { Category, Deck } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState, type ReactElement } from 'react';
import { decksQuery } from '../api/queries';
import { IconButton } from '../ui/buttons/IconButton';
import { IconLink } from '../ui/buttons/IconLink';
import { deckHref, type ChipView } from '../ui/chip-order';
import { viewLabel } from '../ui/deck-views';
import { Icon } from '../ui/icons/Icon';
import { MoreMenu } from '../ui/MoreMenu';
import { NavLink } from '../ui/NavLink';
import { SearchSheet } from './SearchSheet';
import { categorySwitchActions, deckSwitchActions } from './switcher-actions';
import { useSearchShortcut } from './use-search-shortcut';
import './deck-header.css';

/** What a card list (a view or search results) adds to the header. */
export interface DeckHeaderList {
  categories: readonly Category[];
  /** The list view on screen; null on search results. */
  view: ChipView | null;
  /** The query on screen (search results), '' elsewhere. */
  query: string;
  /** Runs a search (a trimmed, non-blank query). */
  onSearch: (q: string) => void;
}

/**
 * D380 (043): the deck pages' one-line header, a breadcrumb of deck / view, each with a caret
 * that switches it (D381), and a Search button that opens the search sheet (D382). Pages other
 * than the card lists show the deck crumb only.
 */
export function DeckHeader({
  deck,
  back,
  list,
}: {
  deck: Deck;
  /** D200: one level up (`backTarget(screen)`). */
  back: string;
  list?: DeckHeaderList | null;
}): ReactElement {
  const decks = useQuery(decksQuery());
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useSearchShortcut(Boolean(list) && !searchOpen, openSearch);

  const runSearch = (q: string) => {
    setSearchOpen(false);
    list?.onSearch(q);
  };

  return (
    <header className="app-header deck-header">
      <IconLink href={back} icon="back" label="Back" className="app-header__back" />
      <nav className="deck-crumbs" aria-label="Breadcrumb">
        <ol className="deck-crumbs__list">
          <li className="deck-crumbs__item deck-crumbs__item--deck">
            <h1 className="deck-crumbs__title">
              <NavLink href={deckHref(deck.slug)} className="deck-crumbs__deck">
                <span dir="auto">{deck.name}</span>
              </NavLink>
            </h1>
            <MoreMenu
              actions={deckSwitchActions(decks.data ?? [], deck.slug)}
              label="Switch deck"
              icon="caret-down"
              align="start"
              triggerClassName="deck-crumbs__caret"
            />
          </li>
          {list && (
            <li className="deck-crumbs__item deck-crumbs__item--view">
              <ViewSwitcher deck={deck} list={list} />
            </li>
          )}
        </ol>
      </nav>
      {list && <IconButton icon="search" label="Search" onClick={openSearch} />}
      {list && searchOpen && (
        <SearchSheet
          deckSlug={deck.slug}
          initialQuery={list.query}
          onSearch={runSearch}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </header>
  );
}

/** The view crumb: its name and caret are one menu button listing the deck's views. */
function ViewSwitcher({ deck, list }: { deck: Deck; list: DeckHeaderList }): ReactElement {
  const name = list.view ? viewLabel(list.view, list.categories) : 'Search';
  const actions = categorySwitchActions(deck.slug, list.categories, list.view, {
    showArchived: can(deck.role, 'item.archive'),
    showLinks: can(deck.role, 'item.update'),
  });
  return (
    <MoreMenu
      actions={actions}
      label={`Category: ${name}`}
      align="start"
      triggerClassName="deck-crumbs__view"
      trigger={
        <>
          <span className="deck-crumbs__view-name" dir="auto">
            {name}
          </span>
          <Icon name="caret-down" />
        </>
      }
    />
  );
}
