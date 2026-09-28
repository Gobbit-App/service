import { z } from 'zod';
import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from '../limits';

export class InvalidCursorError extends Error {
  constructor(message: string = 'Invalid cursor') {
    super(message);
    this.name = 'InvalidCursorError';
  }
}

export type CursorData = { createdAt: string; id: string };

export function encodeCursor(d: { createdAt: Date | string; id: string }): string {
  const isoString = d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt;
  return Buffer.from(JSON.stringify({ c: isoString, i: d.id })).toString('base64url');
}

export function decodeCursor(s: string): CursorData {
  try {
    const decoded = Buffer.from(s, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded);

    // Validate shape
    if (typeof parsed !== 'object' || parsed === null) {
      throw new InvalidCursorError('Invalid cursor');
    }

    const { c, i } = parsed;

    // Validate createdAt (c)
    if (typeof c !== 'string') {
      throw new InvalidCursorError('Invalid cursor');
    }

    // Validate that it's a valid ISO date string
    if (isNaN(Date.parse(c))) {
      throw new InvalidCursorError('Invalid cursor');
    }

    // Validate id (i) is a UUID
    if (typeof i !== 'string') {
      throw new InvalidCursorError('Invalid cursor');
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(i)) {
      throw new InvalidCursorError('Invalid cursor');
    }

    return { createdAt: c, id: i };
  } catch (err) {
    if (err instanceof InvalidCursorError) {
      throw err;
    }
    throw new InvalidCursorError('Invalid cursor');
  }
}

export const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(PAGE_LIMIT_MAX)
  .default(PAGE_LIMIT_DEFAULT);

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
