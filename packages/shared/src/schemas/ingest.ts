import { z } from 'zod';
import { httpUrlSchema, isoDateTimeSchema, uuidSchema } from './common';
import { itemSchema } from './item';
import {
  autoPublishOutcomes,
  ingestFailureCodes,
  dedupActions,
  dedupVias,
  ingestCardTypes,
  ingestChannels,
  ingestJobStatuses,
  INGEST_TEXT_MAX,
  INGEST_TITLE_MAX,
  INGEST_TOKEN_LABEL_MAX,
} from '../ingest/constants';

/**
 * D93: POST /ingest fields (JSON body, or the text fields of a multipart body).
 * `deckId` accepts a deck id or slug; omitted → the token's deck, else `me`.
 * Images arrive only as multipart `files`; the service checks "something to ingest".
 */
export const ingestRequestSchema = z.object({
  deckId: z.string().trim().min(1).max(100).optional(),
  text: z.string().max(INGEST_TEXT_MAX).optional(),
  url: httpUrlSchema.optional(),
  title: z.string().max(INGEST_TITLE_MAX).optional(),
  /** Session callers say `pwa` (share target) or `paste`; token callers are always `shortcut`. */
  channel: z.enum(['pwa', 'paste']).optional(),
});
export type IngestRequest = z.infer<typeof ingestRequestSchema>;

export const ingestAcceptedSchema = z.object({
  id: uuidSchema,
  status: z.enum(ingestJobStatuses),
});
export type IngestAccepted = z.infer<typeof ingestAcceptedSchema>;

/** An uploaded image as kept on the job (D101). */
export const ingestImageSchema = z.object({
  publicId: z.string(),
  bytes: z.number().int().nonnegative(),
  mime: z.string(),
});
export type IngestImage = z.infer<typeof ingestImageSchema>;

/** D94: what was shared, before any processing. */
export const ingestRawSchema = z.object({
  text: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  images: z.array(ingestImageSchema),
});
export type IngestRaw = z.infer<typeof ingestRawSchema>;

export const openGraphSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable(),
  image: z.string().nullable(),
  siteName: z.string().nullable(),
});
export type OpenGraph = z.infer<typeof openGraphSchema>;

export const fetchFallbacks = ['none', 'og', 'shared_text', 'skipped'] as const;
export type FetchFallback = (typeof fetchFallbacks)[number];

/** D102: the normalized source the extractor sees. */
export const normalizedSourceSchema = z.object({
  text: z.string(),
  url: z.string().optional(),
  pageTitle: z.string().nullable().optional(),
  og: openGraphSchema.optional(),
  lang: z.string().nullable().optional(),
  /** Derived JPEG URLs the model sees (D101). */
  images: z.array(z.string()),
  fetch: z.object({
    status: z.number().int().nullable(),
    finalUrl: z.string().nullable(),
    ms: z.number().int().nonnegative(),
    fallback: z.enum(fetchFallbacks),
    error: z.string().nullable().optional(),
  }),
});
export type NormalizedSource = z.infer<typeof normalizedSourceSchema>;

/** D105: what the extraction decided, kept on the job. */
export const extractionSummarySchema = z.object({
  model: z.string(),
  escalated: z.boolean(),
  type: z.enum(ingestCardTypes),
  confidence: z.number().min(0).max(1),
  language: z.string(),
  categoryIds: z.array(z.string()),
  newCategory: z.string().nullable(),
});
export type ExtractionSummary = z.infer<typeof extractionSummarySchema>;

/** D103: the dedup verdict, kept on the job. */
export const dedupVerdictSchema = z.object({
  action: z.enum(dedupActions),
  itemId: uuidSchema.nullable(),
  similarity: z.number().nullable(),
  via: z.enum(dedupVias),
});
export type DedupVerdict = z.infer<typeof dedupVerdictSchema>;

/** D109: GET /ingest/{id}, the debug view (sharer or deck publisher). */
export const ingestJobSchema = z.object({
  id: uuidSchema,
  deckId: uuidSchema,
  userId: uuidSchema.nullable(),
  channel: z.enum(ingestChannels),
  clientLabel: z.string().nullable(),
  status: z.enum(ingestJobStatuses),
  raw: ingestRawSchema.nullable(),
  normalized: normalizedSourceSchema.nullable(),
  extraction: extractionSummarySchema.nullable(),
  dedup: dedupVerdictSchema.nullable(),
  resultItemId: uuidSchema.nullable(),
  error: z.string().nullable(),
  failureCode: z.enum(ingestFailureCodes).nullable(),
  autoPublish: z.enum(autoPublishOutcomes).nullable(),
  attempts: z.number().int(),
  retryCount: z.number().int(),
  /** Σ llm_calls.cost_usd for this job. */
  costUsd: z.number(),
  reviewedBy: uuidSchema.nullable(),
  reviewedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type IngestJob = z.infer<typeof ingestJobSchema>;

/** D106: one proposal in the review queue. */
export const reviewEntrySchema = z.object({
  item: itemSchema,
  job: z
    .object({
      id: uuidSchema,
      channel: z.enum(ingestChannels),
      sharedBy: z.object({ id: uuidSchema, displayName: z.string() }).nullable(),
      /** The AI app that made a direct proposal (`mcp` channel), e.g. "Claude". */
      clientLabel: z.string().nullable(),
      createdAt: isoDateTimeSchema,
      dedup: dedupVerdictSchema.nullable(),
      newCategory: z.string().nullable(),
      /** The shared URL, or the first characters of the shared text. */
      sourcePreview: z.string().nullable(),
      /** D193: why a publisher's share was not published directly (FR-011). */
      autoPublish: z.enum(autoPublishOutcomes).nullable(),
    })
    .nullable(),
  /** The card a `possible_duplicate` / `update` verdict points at, when still visible. */
  target: itemSchema.nullable(),
});
export type ReviewEntry = z.infer<typeof reviewEntrySchema>;

export const reviewListSchema = z.object({
  data: z.array(reviewEntrySchema),
  count: z.number().int().nonnegative(),
});
export type ReviewList = z.infer<typeof reviewListSchema>;

export const reviewCountSchema = z.object({ count: z.number().int().nonnegative() });
export type ReviewCount = z.infer<typeof reviewCountSchema>;

/** D106: POST /items/{id}/publish. */
export const publishRequestSchema = z
  .object({
    mode: z.enum(['new', 'update']).default('new'),
    /** Create the job's suggested `newCategory` and add the card to it. */
    createCategory: z.boolean().optional(),
  })
  .strict();
export type PublishRequest = z.infer<typeof publishRequestSchema>;

/** D99: an ingest token as listed in settings (never the secret). */
export const ingestTokenSchema = z.object({
  id: uuidSchema,
  label: z.string(),
  prefix: z.string(),
  deckId: uuidSchema.nullable(),
  lastUsedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type IngestToken = z.infer<typeof ingestTokenSchema>;

export const ingestTokenListSchema = z.object({ data: z.array(ingestTokenSchema) });
export type IngestTokenList = z.infer<typeof ingestTokenListSchema>;

export const ingestTokenCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(INGEST_TOKEN_LABEL_MAX),
    deckId: uuidSchema.optional(),
  })
  .strict();
export type IngestTokenCreate = z.infer<typeof ingestTokenCreateSchema>;

/** Returned once on create: the only time the plain token leaves the server. */
export const ingestTokenCreatedSchema = ingestTokenSchema.extend({ token: z.string() });
export type IngestTokenCreated = z.infer<typeof ingestTokenCreatedSchema>;
