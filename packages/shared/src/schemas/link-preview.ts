import z from 'zod';
import { MEDIA_IMAGE_DIMENSION_MAX } from '../media/constants';
import { httpUrlSchema } from './common';

/** D160: pixel size of a recorded image; server-owned (copied from the asset). */
export const imageDimensionSchema = z.number().int().min(1).max(MEDIA_IMAGE_DIMENSION_MAX);

/** The link preview shared by link cards and events with a link (D356). */
export const storedLinkPreviewSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    image: httpUrlSchema.optional(),
    /**
     * D163: stored copy of `image` (server-owned), or a recorded asset of the deck (D160).
     * `null` in a write removes the photo (015); it is never stored.
     */
    publicId: z.string().min(1).nullable().optional(),
    width: imageDimensionSchema.optional(),
    height: imageDimensionSchema.optional(),
    /** D350: image-rules version the snapshot job last looked under (server-owned). */
    imageLookup: z.number().int().min(1).optional(),
    /** D350: the member removed the photo; nothing adds one back (server-owned). */
    imageRemoved: z.literal(true).optional(),
  })
  .strict();

export type StoredLinkPreview = z.infer<typeof storedLinkPreviewSchema>;
