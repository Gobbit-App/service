import { z } from 'zod';
import { memberRoles } from '../enums';
import { emailSchema } from './auth';
import { memberSummarySchema } from './profile';

export const membershipSchema = z.object({
  id: z.string(),
  deckId: z.string(),
  userId: z.string(),
  email: z.string().nullable(),
  displayName: z.string(),
  role: z.enum(memberRoles),
  invitedAt: z.string(),
  acceptedAt: z.string().nullable(),
});

const inviteRole = z.enum(memberRoles).default('reader');

/** D425: exactly one of `email` or `username` (both or neither fails). A bad username is just a miss in the service. */
export const inviteCreateSchema = z.union([
  z.object({ email: emailSchema, role: inviteRole }).strict(),
  z.object({ username: z.string().trim().min(1).max(30), role: inviteRole }).strict(),
]);

/** D185: `PATCH /decks/{id}/members/{userId}`; the response is the updated `Member`. */
export const memberRolePatchSchema = z.object({ role: z.enum(memberRoles) }).strict();

export const inviteResponseSchema = z.object({ membership: membershipSchema });

/** A `GET /decks/:id/members` row; `implicit` marks owners by account (D33), who have no membership row. */
export const memberSchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  displayName: z.string(),
  username: memberSummarySchema.shape.username,
  initials: z.string(),
  photo: memberSummarySchema.shape.photo,
  role: z.enum(memberRoles),
  invitedAt: z.string().nullable(),
  invitedBy: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  implicit: z.boolean(),
});

export const memberListSchema = z.object({ data: z.array(memberSchema) });

export type Membership = z.infer<typeof membershipSchema>;
export type InviteCreate = z.infer<typeof inviteCreateSchema>;
export type InviteCreateInput = z.input<typeof inviteCreateSchema>;
export type Member = z.infer<typeof memberSchema>;
export type MemberRolePatch = z.infer<typeof memberRolePatchSchema>;
