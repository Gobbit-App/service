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

/** D366: an event the member is notified about, from its first notice until it ends. */
export const comingUpEntrySchema = z.object({
  kind: z.literal('event'),
  itemId: z.uuid(),
  title: z.string(),
  deck: z.object({ slug: z.string(), name: z.string() }),
  startsAt: z.string(),
  endsAt: z.string(),
  allDay: z.boolean(),
  timeZone: z.string(),
  location: z.string().nullable(),
});
export type ComingUpEntry = z.infer<typeof comingUpEntrySchema>;

/**
 * D298: `items` = waiting on you (overdue first, then deadline); `upcoming` = your hidden ones.
 * D366: `comingUp` = events notifying you now, soonest start first; the bell never counts them.
 */
export const pendingListSchema = z.object({
  items: z.array(pendingItemSchema),
  upcoming: z.array(pendingItemSchema),
  comingUp: z.array(comingUpEntrySchema),
});
export type PendingList = z.infer<typeof pendingListSchema>;
