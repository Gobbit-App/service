import { useState, useEffect } from 'react';
import type { ReactElement } from 'react';
import { IconButton } from './buttons/IconButton';
import type { ItemType } from '@gobbit/shared';
import { trackContent } from '../analytics/analytics';
import { shareItem, shareUrl, type ShareNavigator } from '../lib/share';

/** A button to share an item. */
export function ShareButton(props: {
  itemId: string;
  title: string;
  /** D248: ids for the `card-shared` event; never the title. */
  deckId?: string;
  type?: ItemType;
  origin?: string;
  nav?: ShareNavigator;
}): ReactElement {
  const origin = props.origin ?? window.location.origin;
  const nav = props.nav ?? (navigator as ShareNavigator);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      const timerId = setTimeout(() => {
        setToast(null);
      }, 2500);
      return () => clearTimeout(timerId);
    }
  }, [toast]);

  const handleClick = async () => {
    try {
      const outcome = await shareItem(
        {
          url: shareUrl(origin, props.itemId),
          title: props.title,
        },
        nav,
      );

      if (outcome === 'shared' || outcome === 'copied') {
        trackContent('card-shared', {
          deckId: props.deckId,
          itemId: props.itemId,
          type: props.type,
          channel: outcome === 'shared' ? 'share-sheet' : 'copy-link',
        });
      }
      if (outcome === 'copied') {
        setToast('Link copied');
      } else if (outcome === 'failed') {
        setToast("Couldn't share this card");
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // silently ignore AbortError
      }
      // ignore other errors as well
    }
  };

  return (
    <span className="share-button-wrap">
      <IconButton icon="share" label="Share" className="share-button" onClick={handleClick} />
      {toast && (
        <span role="status" className="share-button__toast">
          {toast}
        </span>
      )}
    </span>
  );
}
