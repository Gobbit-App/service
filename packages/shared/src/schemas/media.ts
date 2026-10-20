import { z } from 'zod';
import { httpUrlSchema } from './common';
import { linkPayloadSchema } from './payloads';
import { LINK_PREVIEW_DESCRIPTION_MAX, LINK_PREVIEW_TITLE_MAX } from '../media/constants';

/** D133: POST /decks/:id/media/sign — one signed direct upload. The API secret is never in it. */
export const mediaSignResponseSchema = z
  .object({
    uploadUrl: z.string(),
    apiKey: z.string(),
    /** Unix seconds; signed, valid for an hour at Cloudinary. */
    timestamp: z.number().int(),
    signature: z.string(),
    folder: z.string(),
    tags: z.string(),
    allowedFormats: z.string(),
    /** Checked by the client before the upload starts. */
    maxBytes: z.number().int(),
    /** The editor asks for a new permission after this. */
    expiresAt: z.string(),
  })
  .strict();
export type MediaSignResponse = z.infer<typeof mediaSignResponseSchema>;

/** D134: POST /decks/:id/link-preview body. */
export const linkPreviewRequestSchema = z.object({ url: httpUrlSchema });
export type LinkPreviewRequest = z.infer<typeof linkPreviewRequestSchema>;

/** The link payload's `preview` object, with the lookup's length caps. */
export const linkPreviewSchema = linkPayloadSchema.shape.preview.unwrap().extend({
  title: z.string().max(LINK_PREVIEW_TITLE_MAX).optional(),
  description: z.string().max(LINK_PREVIEW_DESCRIPTION_MAX).optional(),
});
export type LinkPreview = z.infer<typeof linkPreviewSchema>;

/** `preview: null` covers every failure; the reason is never returned (FR-012). */
export const linkPreviewResponseSchema = z
  .object({ preview: linkPreviewSchema.nullable() })
  .strict();
export type LinkPreviewResponse = z.infer<typeof linkPreviewResponseSchema>;
