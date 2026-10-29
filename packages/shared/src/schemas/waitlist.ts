import { z } from 'zod';
import { waitlistKinds } from '../enums';
import { codePointLength } from '../utils/utf8-bytes';
import { WAITLIST_NOTE_MAX, WAITLIST_UTM_MAX, WAITLIST_UTM_PATTERN } from '../waitlist/constants';
import { emailSchema } from './auth';

/** Trimmed; an empty note counts as no note; at most `WAITLIST_NOTE_MAX` code points. */
const noteSchema = z
  .string()
  .trim()
  .refine((s) => codePointLength(s) <= WAITLIST_NOTE_MAX, {
    message: `Note must be at most ${WAITLIST_NOTE_MAX} characters`,
  })
  .transform((s) => (s === '' ? undefined : s));

/** A campaign tag is advisory: lower-cased, and silently dropped when malformed (D217). */
const utmSourceSchema = z
  .string()
  .max(256)
  .transform((s) => {
    const tag = s.trim().toLowerCase();
    return tag.length <= WAITLIST_UTM_MAX && WAITLIST_UTM_PATTERN.test(tag) ? tag : undefined;
  });

/** D218: a padded or upper-case address reaches the same entry (normalized again in the service). */
const waitlistEmailSchema = z.string().trim().toLowerCase().pipe(emailSchema);

/** D218: `POST /waitlist`. `website` is the honeypot (D219); any non-empty value drops the join. */
export const waitlistJoinSchema = z
  .object({
    email: waitlistEmailSchema,
    kind: z.enum(waitlistKinds),
    note: noteSchema.optional(),
    utmSource: utmSourceSchema.optional(),
    website: z.string().max(256).optional(),
  })
  .strict();

export const waitlistJoinResponseSchema = z.object({ ok: z.literal(true) });

/** `GET /waitlist/confirm` without `APP_URL` (no web app to redirect to). */
export const waitlistConfirmResultSchema = z.object({ confirmed: z.boolean() });

export type WaitlistJoinRequest = z.input<typeof waitlistJoinSchema>;
export type WaitlistJoinInput = z.output<typeof waitlistJoinSchema>;
export type WaitlistConfirmResult = z.infer<typeof waitlistConfirmResultSchema>;
