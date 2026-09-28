import { z } from 'zod';
import { nameSchema, slugSchema } from './common';
import { categorySchema } from './category';
import { pocketbookKinds } from '../enums';

export const pocketbookSchema = z.object({
  id: z.string(),
  kind: z.enum(pocketbookKinds),
  slug: z.string(),
  name: z.string(),
  isPublic: z.boolean(),
  ownerAccountId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const pocketbookWithCategoriesSchema = pocketbookSchema.extend({
  categories: z.array(categorySchema),
});

export const pocketbookCreateSchema = z
  .object({
    name: nameSchema,
    slug: slugSchema.optional(),
    kind: z.enum(pocketbookKinds).optional(),
    isPublic: z.boolean().optional(),
  })
  .strict();

export const pocketbookPatchSchema = z
  .object({
    name: nameSchema.optional(),
    slug: slugSchema.optional(),
    isPublic: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

export const pocketbookListSchema = z.object({
  data: z.array(pocketbookSchema),
});

export type Pocketbook = z.infer<typeof pocketbookSchema>;
export type PocketbookWithCategories = z.infer<typeof pocketbookWithCategoriesSchema>;
export type PocketbookCreate = z.infer<typeof pocketbookCreateSchema>;
export type PocketbookPatch = z.infer<typeof pocketbookPatchSchema>;
