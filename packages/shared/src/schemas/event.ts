import { z } from 'zod';
import {
  ITEM_EVENT_PAGE_DEFAULT,
  ITEM_EVENT_PAGE_MAX,
  actorVias,
  itemEventKinds,
} from '../events/constants';

/** D188: one line of a deck's activity log; `actor: null` = a former member. */
export const itemEventSchema = z.object({
  id: z.string(),
  /** Null once the card is purged (no link). */
  itemId: z.string().nullable(),
  title: z.string(),
  kind: z.enum(itemEventKinds),
  via: z.enum(actorVias),
  actor: z.object({ userId: z.string(), displayName: z.string() }).nullable(),
  changes: z.array(z.string()),
  createdAt: z.string(),
});

export const itemEventPageSchema = z.object({
  data: z.array(itemEventSchema),
  nextCursor: z.string().nullable(),
});

export const itemEventListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(ITEM_EVENT_PAGE_MAX).default(ITEM_EVENT_PAGE_DEFAULT),
  itemId: z.uuid().optional(),
});

export type ItemEvent = z.infer<typeof itemEventSchema>;
export type ItemEventPage = z.infer<typeof itemEventPageSchema>;
export type ItemEventListQuery = z.infer<typeof itemEventListQuerySchema>;
