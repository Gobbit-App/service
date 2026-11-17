import type { ReactElement } from 'react';
import type { Item } from '@gobbit/shared';
import { Avatar } from '../ui/Avatar';

/** D421: who added the card; nothing for personal-deck cards (`creator: null`), a person glyph when unknown. */
export function CreatorAvatar({
  creator,
}: {
  creator: Item['creator'] | undefined;
}): ReactElement | null {
  return creator ? <Avatar member={creator} size="sm" /> : null;
}
