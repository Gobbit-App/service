import { z } from 'zod';

/** D298: most entries per section of `GET /me/pending` (the bell counts what is listed). */
export const PENDING_LIST_MAX = 100;

/**
 * D298: one thing waiting on the member. `kind` is the extension point (FR-023): today only
 * reminders; other actionable items join with their own kind.
 */
export const pendingItemSchema = z.object({
  kind: z.literal('reminder'),
  itemId: z.uuid(),
  title: z.string(),
  deck: z.object({ slug: z.string(), name: z.string() }),
  deadline: z.string(),
  revealAt: z.string(),
  overdue: z.boolean(),
});
export type PendingItem = z.infer<typeof pendingItemSchema>;

/** D298: `items` = waiting on you (overdue first, then deadline); `upcoming` = your hidden ones. */
export const pendingListSchema = z.object({
  items: z.array(pendingItemSchema),
  upcoming: z.array(pendingItemSchema),
});
export type PendingList = z.infer<typeof pendingListSchema>;
