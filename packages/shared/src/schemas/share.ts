import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';
import { autoPublishOutcomes, ingestFailureCodes, shareChannels } from '../ingest/constants';

/** D196: what the sharer sees of one share. */
export const shareStates = ['processing', 'failed', 'in_review', 'published', 'not_added'] as const;
export type ShareState = (typeof shareStates)[number];

/**
 * D196: one of the caller's own shares (`GET /decks/{id}/shares`, `GET /shares/{id}`). Strict:
 * the stored error text and the shared content never leave the server.
 */
export const shareSummarySchema = z
  .object({
    id: uuidSchema,
    deckId: uuidSchema,
    channel: z.enum(shareChannels),
    createdAt: isoDateTimeSchema,
    state: z.enum(shareStates),
    /** Enough to recognise the share: the card or page title, the link's host, photo count. */
    preview: z
      .object({
        title: z.string().nullable(),
        host: z.string().nullable(),
        photoCount: z.number().int().nonnegative(),
      })
      .strict(),
    failureCode: z.enum(ingestFailureCodes).nullable(),
    canRetry: z.boolean(),
    /** D193: why a publisher's share waits for review, or `published` when it skipped it. */
    autoPublish: z.enum(autoPublishOutcomes).nullable(),
    /** The card made from the share; `deleted` once it was deleted. */
    item: z.object({ id: uuidSchema, title: z.string(), deleted: z.boolean() }).strict().nullable(),
    reviewedBy: z.object({ displayName: z.string() }).strict().nullable(),
    reviewedAt: isoDateTimeSchema.nullable(),
  })
  .strict();
export type ShareSummary = z.infer<typeof shareSummarySchema>;

export const shareListSchema = z.object({ shares: z.array(shareSummarySchema) });
export type ShareList = z.infer<typeof shareListSchema>;
