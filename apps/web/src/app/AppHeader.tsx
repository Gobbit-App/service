import type { ReactElement, ReactNode } from 'react';
import { IconLink } from '../ui/buttons/IconLink';

/** D322: the chimney-less logo tile (D321), legible at header size. */
export const HEADER_LOGO_SRC = '/favicon.svg';

/**
 * Top bar of signed-in pages: a leading control, page title and the page's own actions. The
 * leading control is Back, or the logo on the deck list (no level above it). Settings, Activity
 * and Sign out live in the bottom bar's ⋯ menu (D276, ADR-067).
 */
export function AppHeader({
  title,
  back,
  actions,
}: {
  title: string;
  /** D200: one level up (`backTarget(screen)`); null on the deck list = the logo instead. */
  back: string | null;
  actions?: ReactNode;
}): ReactElement {
  return (
    <header className="app-header">
      {back === null ? (
        <img className="app-header__logo" src={HEADER_LOGO_SRC} alt="" width="32" height="32" />
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
