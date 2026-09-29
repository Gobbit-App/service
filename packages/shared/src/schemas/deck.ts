import { z } from 'zod';
import { nameSchema, slugSchema } from './common';
import { categorySchema } from './category';
import { deckKinds, memberRoles } from '../enums';

export const deckSchema = z.object({
  id: z.string(),
  kind: z.enum(deckKinds),
  slug: z.string(),
  name: z.string(),
  isPublic: z.boolean(),
  ownerAccountId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** D33: the caller's role on this deck. */
  role: z.enum(memberRoles),
});

export const deckWithCategoriesSchema = deckSchema.extend({
  categories: z.array(categorySchema),
});

export const deckCreateSchema = z
  .object({
    name: nameSchema,
    slug: slugSchema.optional(),
    kind: z.enum(deckKinds).optional(),
    isPublic: z.boolean().optional(),
  })
  .strict();

export const deckPatchSchema = z
  .object({
    name: nameSchema.optional(),
    slug: slugSchema.optional(),
    isPublic: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

export const deckListSchema = z.object({
  data: z.array(deckSchema),
});

export type Deck = z.infer<typeof deckSchema>;
export type DeckWithCategories = z.infer<typeof deckWithCategoriesSchema>;
export type DeckCreate = z.infer<typeof deckCreateSchema>;
export type DeckPatch = z.infer<typeof deckPatchSchema>;
