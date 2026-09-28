import z from 'zod';
import { CALC_MAX_FIELDS, PAYLOAD_MAX_BYTES, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from '../limits';
import type { ItemType } from '../enums';
import { utf8Bytes } from '../utils/utf8-bytes';
import { httpUrlSchema } from './common';
import { validateCalcExpression } from './calc-expression';

export const textPayloadSchema = z.object({}).strict();

export const linkPayloadSchema = z
  .object({
    url: httpUrlSchema,
    preview: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        image: httpUrlSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const imagePayloadSchema = z
  .object({
    publicId: z.string().min(1),
    alt: z.string().min(1),
  })
  .strict();

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
  image: imagePayloadSchema,
  table: tablePayloadSchema,
  calc: calcPayloadSchema,
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
export type ImagePayload = z.infer<typeof imagePayloadSchema>;
export type TablePayload = z.infer<typeof tablePayloadSchema>;
export type CalcPayload = z.infer<typeof calcPayloadSchema>;
