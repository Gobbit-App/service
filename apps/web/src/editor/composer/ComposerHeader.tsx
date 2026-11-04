import type { ReactElement, ReactNode } from 'react';
import { IconLink } from '../../ui/buttons/IconLink';

/**
 * D300 (039): the composer frame's bar, shared by the type chooser and the composer. Close is a
 * link (so the leave guard decides), then the heading with the deck under it, then `actions`.
 * `below` hangs under the row (the Save reason, the progress line).
 */
export function ComposerHeader({
  heading,
  deckName,
  closeHref,
  busy = false,
  actions,
  below,
}: {
  heading: string;
  deckName: string;
  closeHref: string;
  busy?: boolean;
  actions?: ReactNode;
  below?: ReactNode;
}): ReactElement {
  return (
    <header className="composer-bar" data-busy={busy || undefined}>
      <div className="composer-bar__row">
        <IconLink href={closeHref} icon="close" label="Close" className="composer-bar__close" />
        <div className="composer-bar__titles">
          <h1 className="composer-bar__title">{heading}</h1>
          <p className="composer-bar__deck" dir="auto">
            {deckName}
          </p>
        </div>
        {actions}
      </div>
      {below}
    </header>
  );
}
