import { z } from 'zod';
import { NAME_MAX, SLUG_MAX } from '../limits';

export const uuidSchema = z.uuid();

export const slugSchema = z
  .string()
  .min(1)
  .max(SLUG_MAX)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const isoDateTimeSchema = z.string();

export const nameSchema = z.string().trim().min(1).max(NAME_MAX);

export const httpUrlSchema = z
  .url()
  .refine((url) => url.startsWith('http://') || url.startsWith('https://'), {
    message: 'URL must use http or https',
  });
