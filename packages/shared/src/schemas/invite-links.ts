import { z } from 'zod';
import { memberRoles } from '../enums';
import { INVITE_LINK_NAME_MAX } from '../limits';
import { memberSummarySchema } from './profile';

const inviteRoles = memberRoles.filter((r) => r !== 'owner') as ['maintainer', 'editor', 'reader'];

export const inviteLinkCreateSchema = z
  .object({ name: z.string().trim().min(1).max(INVITE_LINK_NAME_MAX), role: z.enum(inviteRoles) })
  .strict();

export const inviteLinkSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(inviteRoles),
  state: z.enum(['waiting', 'accepted', 'revoked', 'expired', 'invalid']),
  createdBy: memberSummarySchema.nullable(),
  acceptedBy: memberSummarySchema.nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  url: z.string().nullable(),
});

export const inviteLinkListSchema = z.object({ links: z.array(inviteLinkSchema) });

export const invitePreviewSchema = z.object({
  state: z.enum(['waiting', 'used', 'revoked', 'expired', 'invalid']),
  deckName: z.string().optional(),
  inviterName: z.string().optional(),
  role: z.enum(inviteRoles).optional(),
});

export const inviteAcceptSchema = z.object({ token: z.string().min(1).max(256) });

export const inviteAcceptResponseSchema = z.object({
  deck: z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() }),
});

export type InviteLinkCreate = z.infer<typeof inviteLinkCreateSchema>;
export type InviteLink = z.infer<typeof inviteLinkSchema>;
export type InvitePreview = z.infer<typeof invitePreviewSchema>;
