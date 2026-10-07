import { z } from 'zod';
import { uuidSchema, slugSchema, isoDateTimeSchema, httpUrlSchema } from './common';
import {
  textPayloadSchema,
  linkPayloadSchema,
  imagePayloadSchema,
  tablePayloadSchema,
  calcPayloadSchema,
  payloadWithinBudget,
} from './payloads';
import { pageSchema, limitSchema } from './pagination';
import { CARD_BODY_MAX, CARD_TITLE_MAX, PAYLOAD_MAX_BYTES } from '../limits';
import { itemTypes, itemStatuses, sourceKinds } from '../enums';
import { codePointLength } from '../utils/utf8-bytes';

export const itemBodySchema = z
  .string()
  .refine((s) => codePointLength(s) <= CARD_BODY_MAX, {
    message: `Body must be at most ${CARD_BODY_MAX} characters`,
  })
  .describe(`Card body, max ${CARD_BODY_MAX} characters (Unicode code points)`);

export const itemTitleSchema = z
  .string()
  .trim()
  .min(1)
  .refine((s) => codePointLength(s) <= CARD_TITLE_MAX, {
    message: `Title must be at most ${CARD_TITLE_MAX} characters`,
  });

// Common fields for item creation
const commonCreateFields = {
  title: itemTitleSchema,
  body: itemBodySchema.default(''),
  categoryIds: z
    .array(z.uuid())
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'categoryIds must be unique',
    })
    .optional(),
  sourceUrl: httpUrlSchema.optional(),
  status: z.enum(itemStatuses).optional(),
};

// Per-type create schemas
const textCreateSchema = z
  .object({
    type: z.literal('text'),
    payload: textPayloadSchema.default({}),
    ...commonCreateFields,
  })
  .strict();

const linkCreateSchema = z
  .object({
    type: z.literal('link'),
    payload: linkPayloadSchema,
    ...commonCreateFields,
  })
  .strict();

const imageCreateSchema = z
  .object({
    type: z.literal('image'),
    payload: imagePayloadSchema,
    ...commonCreateFields,
  })
  .strict();

const tableCreateSchema = z
  .object({
    type: z.literal('table'),
    payload: tablePayloadSchema,
    ...commonCreateFields,
  })
  .strict();

const calcCreateSchema = z
  .object({
    type: z.literal('calc'),
    payload: calcPayloadSchema,
    ...commonCreateFields,
  })
  .strict();

export const itemCreateSchema = z
  .discriminatedUnion('type', [
    textCreateSchema,
    linkCreateSchema,
    imageCreateSchema,
    tableCreateSchema,
    calcCreateSchema,
  ])
  .superRefine((v, ctx) => {
    if (!payloadWithinBudget(v.payload)) {
      ctx.addIssue({
        code: 'custom',
        path: ['payload'],
        message: `Payload exceeds ${PAYLOAD_MAX_BYTES} bytes (UTF-8)`,
      });
    }
  })
  .describe(`Item create body; payload max ${PAYLOAD_MAX_BYTES} bytes (UTF-8)`);

export type ItemCreate = z.infer<typeof itemCreateSchema>;
export type ItemCreateInput = z.input<typeof itemCreateSchema>;

export const itemPatchSchema = z
  .object({
    title: itemTitleSchema.optional(),
    body: itemBodySchema.optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    categoryIds: z.array(z.uuid()).optional(),
    sourceUrl: httpUrlSchema.nullable().optional(),
    status: z.enum(itemStatuses).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

export type ItemPatch = z.infer<typeof itemPatchSchema>;

export const itemSchema = z.object({
  id: uuidSchema,
  deckId: uuidSchema,
  type: z.enum(itemTypes),
  status: z.enum(itemStatuses),
  title: z.string(),
  body: z.string(),
  payload: z.record(z.string(), z.unknown()),
  sourceUrl: z.string().nullable(),
  sourceKind: z.enum(sourceKinds),
  verifiedAt: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  categoryIds: z.array(z.string()),
  isFavorite: z.boolean(),
});

export type Item = z.infer<typeof itemSchema>;

export const itemListQuerySchema = z.object({
  category: slugSchema.optional(),
  status: z.enum(itemStatuses).default('published'),
  type: z.enum(itemTypes).optional(),
  /** P3: `favorite=true` narrows the list to the caller's favorites. */
  favorite: z.enum(['true']).optional(),
  cursor: z.string().min(1).optional(),
  limit: limitSchema,
});

export type ItemListQuery = z.infer<typeof itemListQuerySchema>;

export const itemPageSchema = pageSchema(itemSchema);

export type ItemPage = z.infer<typeof itemPageSchema>;
