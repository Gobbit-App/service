import type { ReactElement, ReactNode } from 'react';
import { IconLink } from '../ui/buttons/IconLink';

/**
 * Top bar of signed-in pages: back control, page title and the page's own actions. Settings,
 * Activity and Sign out live in the bottom bar's ⋯ menu (D276, ADR-067).
 */
export function AppHeader({
  title,
  back,
  actions,
}: {
  title: string;
  /** D200: one level up (`backTarget(screen)`); null on the deck list = no control. */
  back: string | null;
  actions?: ReactNode;
}): ReactElement {
  return (
    <header className="app-header">
      {back === null ? (
        <span className="app-header__back app-header__back--none" aria-hidden="true" />
      ) : (
        <IconLink href={back} icon="back" label="Back" className="app-header__back" />
      )}
      <h1 className="app-header__title" dir="auto">
        {title}
      </h1>
      {actions}
    </header>
  );
}
