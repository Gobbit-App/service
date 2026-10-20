import type { ReactElement } from 'react';
import type { Category, Item } from '@pb/shared';
import type { ImageLoading } from '../cards/ImageCard';
import type { BrowsePane } from './browse-params';
import { FooterBand, panelId, tabId } from './FooterBand';
import { HeaderBand, type HeaderBandProps } from './HeaderBand';
import { ContentPane } from './panes/ContentPane';
import { DetailsPane } from './panes/DetailsPane';
import { SourcePane } from './panes/SourcePane';

export interface BrowsePageProps {
  item: Item;
  deckSlug: string;
  categories: readonly Category[];
  pane: BrowsePane;
  onPane: (pane: BrowsePane) => void;
  /** The current card: binds the gestures, is in the a11y tree, loads its image first. */
  current: boolean;
  /** Current ±1: renders its card; the rest are empty 100dvh placeholders (D144). */
  mounted: boolean;
  /** Measured content width for the image `sizes` (contract §5). */
  imageSizes: string;
  header: Omit<HeaderBandProps, 'active'>;
  onNextCard: (() => void) | null;
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

/** One snap page (contract §2): header band, the card's pane, footer band. */
export function BrowsePage({
  item,
  deckSlug,
  categories,
  pane,
  onPane,
  current,
  mounted,
  imageSizes,
  header,
  onNextCard,
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
      <HeaderBand {...header} active={current} />
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
          image={{ sizes: imageSizes, priority: current }}
        />
      </div>
      <FooterBand
        pageId={item.id}
        pane={pane}
        onPane={onPane}
        onNextCard={onNextCard}
        active={current}
      />
    </section>
  );
}
