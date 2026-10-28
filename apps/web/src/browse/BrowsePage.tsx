import type { ReactElement } from 'react';
import type { Category, Item } from '@pb/shared';
import type { ImageLoading } from '../cards/ImageCard';
import type { BrowsePane } from './browse-params';
import { panelId, tabId } from './PaneBar';
import { ContentPane } from './panes/ContentPane';
import { DetailsPane } from './panes/DetailsPane';
import { SourcePane } from './panes/SourcePane';

export interface BrowsePageProps {
  item: Item;
  deckSlug: string;
  categories: readonly Category[];
  pane: BrowsePane;
  /** The current card: is in the a11y tree and loads its image first. */
  current: boolean;
  /** Current ±1: renders its card; the rest are empty full-height placeholders (D144). */
  mounted: boolean;
}

function PaneBody({
  item,
  deckSlug,
  categories,
  pane,
  image,
}: Pick<BrowsePageProps, 'item' | 'deckSlug' | 'categories' | 'pane'> & {
  image: ImageLoading;
}): ReactElement {
  switch (pane) {
    case 'details':
      return <DetailsPane item={item} categories={categories} />;
    case 'source':
      return <SourcePane item={item} />;
    case 'content':
      return <ContentPane item={item} deckSlug={deckSlug} categories={categories} image={image} />;
  }
}

/** One snap page (contract §2, D218): the card's pane; the controls live in the dock. */
export function BrowsePage({
  item,
  deckSlug,
  categories,
  pane,
  current,
  mounted,
}: BrowsePageProps): ReactElement {
  if (!mounted) {
    return <section className="browse-page" data-item-id={item.id} aria-hidden="true" inert />;
  }
  return (
    <section
      className="browse-page"
      data-item-id={item.id}
      aria-hidden={current ? undefined : true}
      inert={!current}
    >
      <div
        className="browse-page__content"
        role="tabpanel"
        id={panelId(item.id)}
        aria-labelledby={tabId(item.id, pane)}
        tabIndex={0}
      >
        <PaneBody
          item={item}
          deckSlug={deckSlug}
          categories={categories}
          pane={pane}
          image={{ priority: current }}
        />
      </div>
    </section>
  );
}
