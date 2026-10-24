import { z } from 'zod';
import { isoDateTimeSchema, slugSchema, uuidSchema } from './common';
import { pageSchema } from './pagination';
import { itemTypes } from '../enums';
import { entitiesSchema } from '../ingest/entities';
import { PAGE_LIMIT_DEFAULT, PUBLIC_PAGE_LIMIT_MAX } from '../limits';

/** D174: a public category as strangers see it, with its published card count. */
export const publicCategorySchema = z.object({
  slug: z.string(),
  name: z.string(),
  itemCount: z.number().int().min(0),
});

/** D174: a public deck's summary. Only shared and communal decks can be public. */
export const publicDeckSchema = z.object({
  slug: z.string(),
  name: z.string(),
  kind: z.enum(['shared', 'communal']),
  categories: z.array(publicCategorySchema),
});

/** D174: a category reference on a public card (public categories only). */
export const publicCategoryRefSchema = z.object({
  slug: z.string(),
  name: z.string(),
});

/**
 * D174: the public card is an allow-list. No author, favourite, status, deck id, link health,
 * review or ingest data; only the card's public categories.
 */
export const publicItemSchema = z.object({
  id: uuidSchema,
  type: z.enum(itemTypes),
  title: z.string(),
  body: z.string(),
  payload: z.record(z.string(), z.unknown()),
  entities: entitiesSchema,
  sourceUrl: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  categories: z.array(publicCategoryRefSchema),
});

export const publicItemPageSchema = pageSchema(publicItemSchema);

export const publicItemListQuerySchema = z.object({
  category: slugSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(PUBLIC_PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});

export type PublicCategory = z.infer<typeof publicCategorySchema>;
export type PublicDeck = z.infer<typeof publicDeckSchema>;
export type PublicCategoryRef = z.infer<typeof publicCategoryRefSchema>;
export type PublicItem = z.infer<typeof publicItemSchema>;
export type PublicItemPage = z.infer<typeof publicItemPageSchema>;
export type PublicItemListQuery = z.infer<typeof publicItemListQuerySchema>;
