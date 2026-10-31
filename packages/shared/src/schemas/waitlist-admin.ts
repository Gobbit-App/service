import { z } from 'zod';
import { waitlistKinds, waitlistSources, waitlistStatuses } from '../enums';
import { ADMIN_WAITLIST_PAGE_DEFAULT, ADMIN_WAITLIST_PAGE_MAX } from '../waitlist/constants';

/** 032: `GET /admin/waitlist`; the confirmed queue is the default view. */
export const adminWaitlistQuerySchema = z.object({
  status: z.enum(waitlistStatuses).default('confirmed'),
  kind: z.enum(waitlistKinds).optional(),
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_WAITLIST_PAGE_MAX)
    .default(ADMIN_WAITLIST_PAGE_DEFAULT),
});

/** 032: one entry as platform admins see it (the only DTO carrying a waitlist email). */
export const adminWaitlistEntrySchema = z.object({
  id: z.string(),
  email: z.string(),
  kind: z.enum(waitlistKinds),
  note: z.string().nullable(),
  source: z.enum(waitlistSources),
  status: z.enum(waitlistStatuses),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
  invitedAt: z.string().nullable(),
  removedAt: z.string().nullable(),
  invitedBy: z.object({ id: z.string(), displayName: z.string() }).nullable(),
});

export const adminWaitlistCountsSchema = z.object({
  pending: z.number().int(),
  confirmed: z.number().int(),
  invited: z.number().int(),
  removed: z.number().int(),
});

/** `counts` follow the `kind` filter, never the status one (they label the tabs). */
export const adminWaitlistPageSchema = z.object({
  items: z.array(adminWaitlistEntrySchema),
  nextCursor: z.string().nullable(),
  counts: adminWaitlistCountsSchema,
});

/** `mailSent: false` = invited and registered, but the email failed; call again to resend. */
export const adminWaitlistInviteResultSchema = z.object({
  entry: adminWaitlistEntrySchema,
  mailSent: z.boolean(),
});

export type AdminWaitlistQuery = z.infer<typeof adminWaitlistQuerySchema>;
export type AdminWaitlistQueryInput = z.input<typeof adminWaitlistQuerySchema>;
export type AdminWaitlistEntry = z.infer<typeof adminWaitlistEntrySchema>;
export type AdminWaitlistCounts = z.infer<typeof adminWaitlistCountsSchema>;
export type AdminWaitlistPage = z.infer<typeof adminWaitlistPageSchema>;
export type AdminWaitlistInviteResult = z.infer<typeof adminWaitlistInviteResultSchema>;
