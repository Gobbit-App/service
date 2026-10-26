import { useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { fromListState } from '../browse/browse-params';
import { firstVisibleItemId } from './first-visible';
import { IconButton } from '../ui/buttons/IconButton';

/**
 * Contract §1: opens Browse on the card the reader is looking at (push, `fromList`). Lives in
 * the initial chunk, so it imports nothing from Browse beyond the dependency-free params module.
 */
export function BrowseButton({ deckSlug, c }: { deckSlug: string; c: string }): ReactElement {
  const navigate = useNavigate();
  const open = () => {
    const i = firstVisibleItemId() ?? undefined;
    void navigate({
      to: '/d/$slug/browse',
      params: { slug: deckSlug },
      search: { c, i, pane: 'content' },
      state: (prev) => ({ ...prev, ...fromListState(c) }),
    });
  };
  return <IconButton icon="browse" label="Browse" className="browse-button" onClick={open} />;
}
