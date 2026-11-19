import { z } from 'zod';
import { httpUrlSchema, uuidSchema } from './common';
import { coverInputSchema, itemBodySchema, itemTitleSchema } from './item';
import { mediaPayloadSchema } from './payloads';
import {
  BULK_PUBLISH_MAX,
  IMPORT_LABEL_MAX,
  IMPORT_ROWS_PER_REQUEST,
  IMPORT_UNMATCHED_MAX,
} from '../ingest/constants';
import { NAME_MAX } from '../limits';
import { importCardTypes, importFormats } from '../import/constants';

/** D189: one parsed note (parser output, shown in the preview). */
export const importRowSchema = z.object({
  /** 1-based source line (CSV: data row number). */
  line: z.number().int().positive(),
  type: z.enum(importCardTypes),
  title: z.string(),
  body: z.string(),
  sourceUrl: z.string().nullable(),
  categories: z.array(z.string()),
  cover: z.string().nullable(),
  image: z.string().nullable(),
  /** Why the row can't be imported; invalid rows are never sent. */
  error: z.string().nullable(),
});
export type ImportRowDto = z.infer<typeof importRowSchema>;

export const importFormatSchema = z.enum(importFormats);

/** D190: one row of POST /decks/{id}/imports. A link row needs `sourceUrl` (its payload URL). */
export const importDraftSchema = z
  .object({
    type: z.enum(['text', 'link', 'media']),
    title: itemTitleSchema,
    body: itemBodySchema.default(''),
    sourceUrl: httpUrlSchema.optional(),
    categoryIds: z
      .array(uuidSchema)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'categoryIds must be unique',
      })
      .optional(),
    newCategory: z.string().trim().max(NAME_MAX).nullable().optional(),
    /** D446: category names the client could not match. */
    unmatched: z.array(z.string().max(NAME_MAX)).max(IMPORT_UNMATCHED_MAX).optional(),
    cover: coverInputSchema.optional(),
    /** `type: media` only. */
    payload: mediaPayloadSchema.optional(),
  })
  .strict()
  .refine((d) => d.type === 'media' || d.payload === undefined, {
    path: ['payload'],
    message: 'Only a media row has a payload',
  })
  .refine((d) => d.type !== 'link' || d.sourceUrl !== undefined, {
    path: ['sourceUrl'],
    message: 'A link row needs a sourceUrl',
  });
export type ImportDraft = z.infer<typeof importDraftSchema>;
export type ImportDraftInput = z.input<typeof importDraftSchema>;

export const importRequestSchema = z.object({
  /** Shown as the source in review and used by `?source=` (the file name or "Pasted notes"). */
  label: z.string().trim().min(1).max(IMPORT_LABEL_MAX),
  /** Refuse rows with unmatched categories instead of filing them without. */
  strict: z.boolean().default(false),
  rows: z.array(importDraftSchema).min(1).max(IMPORT_ROWS_PER_REQUEST),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

export const importFailureSchema = z.object({
  /** Index of the row in the request. */
  index: z.number().int().nonnegative(),
  /** Problem type, e.g. `/problems/rate-limited`. */
  problem: z.string(),
  detail: z.string().optional(),
});
export type ImportFailure = z.infer<typeof importFailureSchema>;

export const importResultSchema = z.object({
  imported: z.number().int().nonnegative(),
  /** Imported rows flagged `possible_duplicate` or `update` (in the queue with the flag). */
  duplicates: z.number().int().nonnegative(),
  /** Rows refused by rule (cap, strict, invalid); each is also in `failed`. */
  refused: z.number().int().nonnegative(),
  failed: z.array(importFailureSchema),
});
export type ImportResult = z.infer<typeof importResultSchema>;

/** D191: GET /decks/{id}/review?source=<label> keeps one import's proposals. */
export const reviewListQuerySchema = z.object({
  source: z.string().trim().min(1).max(IMPORT_LABEL_MAX).optional(),
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

/** D191: POST /decks/{id}/review/publish. */
export const bulkPublishSchema = z.object({
  ids: z
    .array(uuidSchema)
    .min(1)
    .max(BULK_PUBLISH_MAX)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'ids must be unique' }),
});
export type BulkPublishRequest = z.infer<typeof bulkPublishSchema>;

export const bulkPublishSkipReasons = [
  'needs-decision',
  'already-handled',
  'publish-failed',
] as const;
export type BulkPublishSkipReason = (typeof bulkPublishSkipReasons)[number];

export const bulkPublishResultSchema = z.object({
  published: z.array(uuidSchema),
  skipped: z.array(z.object({ id: uuidSchema, reason: z.enum(bulkPublishSkipReasons) })),
});
export type BulkPublishResult = z.infer<typeof bulkPublishResultSchema>;

/** D191: POST /decks/{id}/imports/discard. */
export const discardImportRequestSchema = z.object({
  source: z.string().trim().min(1).max(IMPORT_LABEL_MAX),
});
export type DiscardImportRequest = z.infer<typeof discardImportRequestSchema>;

export const discardImportResultSchema = z.object({
  discarded: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type DiscardImportResult = z.infer<typeof discardImportResultSchema>;
