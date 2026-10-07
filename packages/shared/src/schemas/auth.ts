import { z } from 'zod';
import { deckSchema } from './deck';

/** Maximum length of an email address (RFC 5321 path limit). */
export const EMAIL_MAX = 254;

export const emailSchema = z.email().max(EMAIL_MAX);

/** Maximum length of the post-sign-in deep link (mirrors the API's `safeNextPath`). */
export const NEXT_PATH_MAX = 512;

export const magicLinkRequestSchema = z
  .object({
    email: emailSchema,
    /** Same-origin path to land on after sign-in; off-site values are ignored by the API. */
    next: z.string().max(NEXT_PATH_MAX).optional(),
  })
  .strict();

export const okSchema = z.object({ ok: z.literal(true) });

export const tokenExchangeResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});

export const meSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
  }),
  decks: z.array(deckSchema),
});

export const callbackQuerySchema = z.object({ token: z.string().min(1).max(256) });

export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;
export type TokenExchangeResponse = z.infer<typeof tokenExchangeResponseSchema>;
export type Me = z.infer<typeof meSchema>;
