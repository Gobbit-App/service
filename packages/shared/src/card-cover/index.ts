import type { ItemType } from '../enums';

export const coverItemTypes = ['text', 'reminder', 'event', 'table', 'calc'] as const;

export type CardCover = { publicId: string; width?: number; height?: number };

export const supportsCover = (type: ItemType): boolean =>
  (coverItemTypes as readonly string[]).includes(type);
