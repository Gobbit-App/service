import { useState, useEffect } from 'react';
import type { ReactElement } from 'react';
import { shareItem, shareUrl, type ShareNavigator } from '../lib/share';

/** A button to share an item. */
export function ShareButton(props: {
  itemId: string;
  title: string;
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
      <button
        type="button"
        className="icon-button share-button"
        aria-label="Share"
        onClick={handleClick}
      >
        <span aria-hidden="true">⤴</span>
      </button>
      {toast && (
        <span role="status" className="toast">
          {toast}
        </span>
      )}
    </span>
  );
}
