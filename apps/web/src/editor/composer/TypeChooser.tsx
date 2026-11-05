import type { ReactElement } from 'react';
import type { CreatableType } from '../creatable-types';
import { ComposerHeader } from './ComposerHeader';
import { TypeTiles } from './TypeTiles';
import './composer.css';

/**
 * D301 (039): the first step of a new card, in the composer frame: what kind of card is it?
 * Picking opens the composer on that type (the route replaces the URL, so Back leaves).
 */
export function TypeChooser({
  deckName,
  closeHref,
  imagesOff,
  onPick,
}: {
  deckName: string;
  closeHref: string;
  imagesOff: boolean;
  onPick: (type: CreatableType) => void;
}): ReactElement {
  return (
    <div className="composer">
      <ComposerHeader heading="New card" deckName={deckName} closeHref={closeHref} />
      <main className="composer__canvas type-chooser">
        <p className="type-chooser__lead">What kind of card?</p>
        <TypeTiles value={null} onPick={onPick} imagesOff={imagesOff} autoFocus />
      </main>
    </div>
  );
}
