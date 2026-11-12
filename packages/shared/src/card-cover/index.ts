import type { ItemType } from '../enums';

/** D387: card types that may carry a cover image. A new type must opt in or out (see test). */
export const coverItemTypes = [
  'text',
  'reminder',
  'event',
  'table',
  'calc',
] as const satisfies readonly ItemType[];

export type CardCover = { publicId: string; width?: number; height?: number };

export function supportsCover(type: ItemType): boolean {
  return (coverItemTypes as readonly ItemType[]).includes(type);
}
