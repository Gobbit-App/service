import type { ReactElement } from 'react';
import type { BrowsePane } from './browse-params';
import { MenuBar, type MenuBarProps } from './MenuBar';
import { PaneBar } from './PaneBar';

export interface BrowseDockProps {
  menu: Omit<MenuBarProps, 'active'>;
  /** The current card's id (tab/panel ids); state pages pass their own key. */
  pageId: string;
  pane: BrowsePane;
  onPane: (pane: BrowsePane) => void;
  /** State pages (loading, empty, offline): the panes are shown but not usable. */
  panesDisabled?: boolean;
}

/**
 * D218: Browse's controls, rendered once and fixed at the bottom under the snap pages — the
 * pane bar (tabs + dots) on top, the menu bar (close, category, position) below it.
 */
export function BrowseDock({
  menu,
  pageId,
  pane,
  onPane,
  panesDisabled = false,
}: BrowseDockProps): ReactElement {
  return (
    <div className="browse-dock">
      <PaneBar
        pageId={pageId}
        pane={pane}
        onPane={onPane}
        active={!panesDisabled}
        disabled={panesDisabled}
      />
      <MenuBar {...menu} active />
    </div>
  );
}
