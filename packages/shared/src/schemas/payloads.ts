import z from 'zod';
import { CALC_MAX_FIELDS, PAYLOAD_MAX_BYTES, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from '../limits';
import type { ItemType } from '../enums';
import { codePointLength, utf8Bytes } from '../utils/utf8-bytes';
import { MEDIA_ALT_MAX, MEDIA_FILE_NAME_MAX, MEDIA_GALLERY_MAX } from '../media/constants';
import { httpUrlSchema } from './common';
import { validateCalcExpression } from './calc-expression';
import { imageDimensionSchema, storedLinkPreviewSchema } from './link-preview';
import { reminderPayloadSchema } from '../reminders/schema';
import { eventPayloadSchema } from '../events-cards/schema';

export { imageDimensionSchema, storedLinkPreviewSchema };

export const textPayloadSchema = z.object({}).strict();

export const linkPayloadSchema = z
  .object({
    url: httpUrlSchema,
    preview: storedLinkPreviewSchema.optional(),
  })
  .strict();

/**
 * D387: the pre-045 flat image payload, accepted from old clients only (normalized to a
 * one-photo gallery with `normalizeLegacyMediaPayload`).
 */
export const legacyImagePayloadSchema = z
  .object({
    publicId: z.string().min(1),
    alt: z.string().optional(),
    width: imageDimensionSchema.optional(),
    height: imageDimensionSchema.optional(),
  })
  .strict();

/** D206/D398: optional, may be empty; renderers fall back via `imageAlt`. Capped on input. */
const mediaAltSchema = z.string().refine((s) => codePointLength(s) <= MEDIA_ALT_MAX, {
  message: `Description must be at most ${MEDIA_ALT_MAX} characters`,
});

/** D398: one gallery photo; `width`/`height` are replaced from the asset (D160). */
export const mediaImageSchema = z
  .object({
    publicId: z.string().min(1),
    alt: mediaAltSchema.optional(),
    width: imageDimensionSchema.optional(),
    height: imageDimensionSchema.optional(),
  })
  .strict();

/** D398: a photo card is a gallery of 1–8 photos in display order; the first is the cover. */
export const mediaImagePayloadSchema = z
  .object({
    kind: z.literal('image'),
    images: z
      .array(mediaImageSchema)
      .min(1, 'Add at least one photo')
      .max(MEDIA_GALLERY_MAX, `A card holds at most ${MEDIA_GALLERY_MAX} photos`)
      .superRefine((images, ctx) => {
        const seen = new Set<string>();
        images.forEach((img, i) => {
          if (seen.has(img.publicId)) {
            ctx.addIssue({
              code: 'custom',
              path: [i, 'publicId'],
              message: 'The same photo is already in this card',
            });
          }
          seen.add(img.publicId);
        });
      }),
  })
  .strict();

/** D386: the fields a PDF, audio or video card shares; facts other than `publicId`/`alt` are server-owned. */
const mediaFileFields = {
  publicId: z.string().min(1),
  alt: mediaAltSchema.optional(),
  width: imageDimensionSchema.optional(),
  height: imageDimensionSchema.optional(),
  durationMs: z.number().int().positive().optional(),
  pages: z.number().int().positive().optional(),
  fileName: z.string().max(MEDIA_FILE_NAME_MAX).optional(),
};

export const mediaPdfPayloadSchema = z
  .object({ kind: z.literal('pdf'), ...mediaFileFields })
  .strict();
export const mediaAudioPayloadSchema = z
  .object({ kind: z.literal('audio'), ...mediaFileFields })
  .strict();
export const mediaVideoPayloadSchema = z
  .object({ kind: z.literal('video'), ...mediaFileFields })
  .strict();

/** D386/D398: a media card's payload, by the kind of file it holds. */
export const mediaPayloadSchema = z.discriminatedUnion('kind', [
  mediaImagePayloadSchema,
  mediaPdfPayloadSchema,
  mediaAudioPayloadSchema,
  mediaVideoPayloadSchema,
]);

export const tablePayloadSchema = z
  .object({
    columns: z.array(z.string().min(1)).min(1).max(TABLE_MAX_COLUMNS),
    rows: z.array(z.array(z.string())).max(TABLE_MAX_ROWS),
  })
  .strict()
  .superRefine((v, ctx) => {
    const n = v.columns.length;
    v.rows.forEach((row, i) => {
      if (row.length !== n) {
        ctx.addIssue({
          code: 'custom',
          path: ['rows', i],
          message: `Row ${i} must have ${n} cells`,
        });
      }
    });
  });

export const calcFieldSchema = z
  .object({
    key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
    label: z.string().min(1),
    unit: z.string().optional(),
    default: z.number().optional(),
  })
  .strict();

export const calcPayloadSchema = z
  .object({
    fields: z.array(calcFieldSchema).min(1).max(CALC_MAX_FIELDS),
    expression: z.string().min(1),
    resultLabel: z.string().min(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    const result = validateCalcExpression(
      v.expression,
      v.fields.map((f) => f.key),
    );
    if (!result.ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['expression'],
        message: result.message,
      });
    }
  });

export const payloadSchemas = {
  text: textPayloadSchema,
  link: linkPayloadSchema,
  media: mediaPayloadSchema,
  table: tablePayloadSchema,
  calc: calcPayloadSchema,
  reminder: reminderPayloadSchema,
  event: eventPayloadSchema,
};

export function payloadWithinBudget(p: unknown): boolean {
  return utf8Bytes(JSON.stringify(p)) <= PAYLOAD_MAX_BYTES;
}

export function payloadSchemaFor(type: ItemType) {
  const schema: z.ZodType = payloadSchemas[type];
  return schema
    .refine(payloadWithinBudget, {
      message: `Payload exceeds ${PAYLOAD_MAX_BYTES} bytes (UTF-8)`,
    })
    .describe(`max ${PAYLOAD_MAX_BYTES} bytes (UTF-8)`);
}

export type TextPayload = z.infer<typeof textPayloadSchema>;
export type LinkPayload = z.infer<typeof linkPayloadSchema>;
export type MediaImage = z.infer<typeof mediaImageSchema>;
export type MediaImagePayload = z.infer<typeof mediaImagePayloadSchema>;
export type MediaFilePayload = z.infer<
  typeof mediaPdfPayloadSchema | typeof mediaAudioPayloadSchema | typeof mediaVideoPayloadSchema
>;
export type MediaPayload = z.infer<typeof mediaPayloadSchema>;
export type LegacyImagePayload = z.infer<typeof legacyImagePayloadSchema>;
export type TablePayload = z.infer<typeof tablePayloadSchema>;
export type CalcPayload = z.infer<typeof calcPayloadSchema>;
