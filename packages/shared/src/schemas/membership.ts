import { z } from 'zod';
import { memberRoles } from '../enums';
import { emailSchema } from './auth';

export const membershipSchema = z.object({
  id: z.string(),
  deckId: z.string(),
  userId: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(memberRoles),
  invitedAt: z.string(),
  acceptedAt: z.string().nullable(),
});

export const inviteCreateSchema = z
  .object({
    email: emailSchema,
    role: z.enum(memberRoles).default('reader'),
  })
  .strict();

export const inviteResponseSchema = z.object({ membership: membershipSchema });

/** A `GET /decks/:id/members` row; `implicit` marks owners by account (D33), who have no membership row. */
export const memberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(memberRoles),
  invitedAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  implicit: z.boolean(),
});

export const memberListSchema = z.object({ data: z.array(memberSchema) });

export type Membership = z.infer<typeof membershipSchema>;
export type InviteCreate = z.infer<typeof inviteCreateSchema>;
export type InviteCreateInput = z.input<typeof inviteCreateSchema>;
export type Member = z.infer<typeof memberSchema>;
