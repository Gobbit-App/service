import { pgEnum, timestamp } from 'drizzle-orm/pg-core';
import { categoryVisibilities, itemStatuses, itemTypes, deckKinds, sourceKinds } from '@pb/shared';

export const tstz = () => timestamp({ withTimezone: true, precision: 3, mode: 'date' });

export const timestamps = {
  createdAt: tstz().notNull().defaultNow(),
  updatedAt: tstz().notNull().defaultNow(),
  deletedAt: tstz(),
};

export const deckKindEnum = pgEnum('deck_kind', deckKinds);
export const categoryVisibilityEnum = pgEnum('category_visibility', categoryVisibilities);
export const itemTypeEnum = pgEnum('item_type', itemTypes);
export const itemStatusEnum = pgEnum('item_status', itemStatuses);
export const sourceKindEnum = pgEnum('source_kind', sourceKinds);
