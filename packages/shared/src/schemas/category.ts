import { z } from 'zod';
import { nameSchema, slugSchema } from './common';
import { categoryVisibilities } from '../enums';

export const categorySchema = z.object({
  id: z.string(),
  deckId: z.string(),
  slug: z.string(),
  name: z.string(),
  visibility: z.enum(categoryVisibilities),
  isDefault: z.boolean(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const categoryCreateSchema = z
  .object({
    name: nameSchema,
    slug: slugSchema.optional(),
    visibility: z.enum(categoryVisibilities).optional(),
    position: z.number().int().min(0).optional(),
  })
  .strict();

export const categoryListSchema = z.object({
  data: z.array(categorySchema),
});

export type Category = z.infer<typeof categorySchema>;
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
