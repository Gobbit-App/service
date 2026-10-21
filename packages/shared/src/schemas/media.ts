import { z } from 'zod';
import { httpUrlSchema } from './common';
import { linkPayloadSchema } from './payloads';
import {
  LINK_PREVIEW_DESCRIPTION_MAX,
  LINK_PREVIEW_TITLE_MAX,
  MEDIA_UPLOAD_FAILURE_MESSAGE_MAX,
} from '../media/constants';

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

/**
 * POST /decks/:id/media/upload-failures — the browser's report of a failed direct upload. The
 * upload never touches the API, so this is the only way Cloudinary's refusal reaches the logs.
 */
export const mediaUploadFailureRequestSchema = z
  .object({
    /** Cloudinary's HTTP status; 0 when the request never got an answer (network, CORS). */
    status: z.number().int().min(0).max(599),
    /** Cloudinary's `error.message`, cut to length by the client. */
    message: z.string().max(MEDIA_UPLOAD_FAILURE_MESSAGE_MAX).nullable(),
    fileType: z.string().max(100).nullable(),
    fileBytes: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type MediaUploadFailureRequest = z.infer<typeof mediaUploadFailureRequestSchema>;

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
