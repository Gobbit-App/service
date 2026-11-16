import { z } from 'zod';
import { PROFILE_LOCATION_MAX, PROFILE_NAME_MAX } from '../limits';
import { checkUsernameShape } from '../username';

const photoSchema = z.object({
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

/** Trim; blank becomes null; limit counted in Unicode code points. */
const text = (max: number) =>
  z
    .string()
    .transform((s) => s.trim() || null)
    .refine((s) => s === null || [...s].length <= max, { message: `At most ${max} characters` })
    .nullable()
    .optional();

const username = z
  .string()
  .transform((s) => s.trim() || null)
  .superRefine((s, ctx) => {
    if (s === null) return;
    const shape = checkUsernameShape(s);
    if (shape !== 'ok') ctx.addIssue({ code: 'custom', message: shape });
  })
  .nullable()
  .optional();

export const profilePatchSchema = z.object({
  username,
  firstName: text(PROFILE_NAME_MAX),
  lastName: text(PROFILE_NAME_MAX),
  location: text(PROFILE_LOCATION_MAX),
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
