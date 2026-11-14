import type { ItemType } from '@gobbit/shared';

/** D306 (039): the title of each type's section; Text has only the common fields. */
export const SECTION_TITLES: Record<ItemType, string | null> = {
  text: null,
  link: 'Link',
  media: 'Photo',
  table: 'Table',
  calc: 'Calculator',
  reminder: 'Reminder',
  event: 'Event',
};

/** Types whose fields lead the canvas (above the title): a link starts from its URL. */
const LEADING: ReadonlySet<ItemType> = new Set<ItemType>(['link', 'media']);

/** Where a type's section sits: before the title, after the body, or nowhere. */
export function sectionPlacement(type: ItemType): 'leading' | 'trailing' | null {
  if (SECTION_TITLES[type] === null) return null;
  return LEADING.has(type) ? 'leading' : 'trailing';
}
