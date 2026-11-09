import type { ItemType } from '@gobbit/shared';
import type { IconName } from '../../ui/icons/Icon';

/** FR-015: why the Image tile can't be picked on a server without image storage. */
export const IMAGES_UNAVAILABLE = "Image cards aren't available: image storage isn't set up here.";

export const TYPE_LABELS: Record<ItemType, string> = {
  text: 'Text',
  link: 'Link',
  image: 'Image',
  table: 'Table',
  calc: 'Calc',
  reminder: 'Reminder',
  event: 'Event',
};

/** D301: one line each, written for someone who has never made a card. */
export const TYPE_HINTS: Record<ItemType, string> = {
  text: 'A note, a tip or instructions',
  reminder: 'Something to remember on a date',
  link: 'Save a page with its preview',
  image: 'A photo with a caption',
  table: 'Rows and columns, like a price list',
  calc: 'A small calculator with your own fields',
  event: 'Something happening at a date and time',
};

export const TYPE_ICONS: Record<ItemType, IconName> = {
  text: 'text',
  reminder: 'bell',
  link: 'link',
  image: 'photo',
  table: 'table',
  calc: 'calc',
  event: 'clock',
};
