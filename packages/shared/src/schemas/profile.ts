import { z } from 'zod';

export const photoSchema = z.object({
  publicId: z.string(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export const profileSchema = z.object({
  username: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  location: z.string().nullable(),
  avatar: photoSchema.nullable(),
  initials: z.string(),
});

/**
 * Types only: the service trims, enforces the limits (code points) and the username shape, and
 * answers 422 with `errors[{ path, message }]` (D-profile 422 contract), not the validator's 400.
 */
export const profilePatchSchema = z.object({
  username: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  avatar: z
    .object({ publicId: z.string().min(1) })
    .nullable()
    .optional(),
});

export const usernameCheckRequest = z.object({ username: z.string() });
export const usernameCheckResponse = z.object({
  available: z.boolean(),
  reason: z.enum(['invalid', 'reserved', 'unavailable']).optional(),
});

/** D427: summaries never carry email or location. */
export const memberSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  initials: z.string(),
  photo: photoSchema.nullable(),
});

export const cardCreatorSchema = memberSummarySchema.extend({ id: z.string().uuid().nullable() });

export const memberLookupRequest = z.object({ query: z.string().min(1).max(254) });
export const memberLookupResponse = z.object({ member: memberSummarySchema.nullable() });

export type Profile = z.infer<typeof profileSchema>;
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
export type MemberSummary = z.infer<typeof memberSummarySchema>;
export type CardCreator = z.infer<typeof cardCreatorSchema>;

/** D419: "First Last", one name alone, else the stored displayName. */
export function displayNameOf(p: {
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
}): string {
  const full = [p.firstName, p.lastName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ');
  return full || p.displayName;
}
