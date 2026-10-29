import { z } from 'zod';
import {
  MAGIC_LINK_TTL_MINUTES_DEFAULT,
  INVITE_TTL_DAYS_DEFAULT,
  SESSION_TTL_DAYS_DEFAULT,
  DEFAULT_EMBEDDING_MODEL,
  INGEST_DAILY_CAP,
  WAITLIST_JOIN_PER_IP_PER_HOUR,
  WAITLIST_JOIN_PER_EMAIL_PER_HOUR,
} from '@pb/shared';
import { cloudNameFrom } from './lib/cloudinary-url';

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const bool = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

/** D239: development-only fallback; production must set its own LOG_HASH_KEY. */
export const DEV_LOG_HASH_KEY = 'gobbit-development-log-hash-key-not-secret';

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  API_URL: z.url().optional(),
  APP_URL: z.url().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: bool('true'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  MAIL_PROVIDER: z.enum(['resend', 'console']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  ALLOW_CONSOLE_MAIL: bool('false'),
  MAGIC_LINK_TTL_MINUTES: positiveInt(MAGIC_LINK_TTL_MINUTES_DEFAULT),
  INVITE_TTL_DAYS: positiveInt(INVITE_TTL_DAYS_DEFAULT),
  SESSION_TTL_DAYS: positiveInt(SESSION_TTL_DAYS_DEFAULT),
  CLIENT_IP_HEADER: z.string().optional(),
  /** Commit the image was built from (Docker build arg); reported by /health so smoke can wait for a deploy. */
  GIT_SHA: z.string().optional(),
  /** Cloudinary credentials URL (key, secret, cloud name) — image delivery and OG cache (D55, D60). */
  CLOUDINARY_URL: z.string().optional(),
  /** Optional; one key for embeddings and Ask, preferred over the direct keys below. Never logged. */
  OPENROUTER_API_KEY: z.string().optional(),
  /** D73: optional; without an embedding key search is text-only and no embedding jobs run. Never logged. */
  OPENAI_API_KEY: z.string().optional(),
  /** D77: optional; without an Ask key Ask answers 503 and /config hides it. Never logged. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Stored model identity (bare OpenAI id); OpenRouter is sent `openai/<id>`. */
  EMBEDDING_MODEL: z.string().default(DEFAULT_EMBEDDING_MODEL),
  /** Provider-specific id; unset → the provider's Haiku default (see ai/providers.ts). */
  ASK_MODEL: z.string().optional(),
  /** D72: concurrent embed-item jobs per worker process. */
  WORKER_CONCURRENCY: positiveInt(2),
  /** D105: provider-specific extraction model; unset → the provider's Haiku default. */
  EXTRACT_MODEL: z.string().optional(),
  /** D105: the one retry when confidence is low; unset → the provider's Sonnet default. */
  EXTRACT_ESCALATION_MODEL: z.string().optional(),
  /** D101: ingest jobs per user per rolling day. */
  INGEST_DAILY_CAP: positiveInt(INGEST_DAILY_CAP),
  /** D104: email-in is on only when the domain, the webhook secret and RESEND_API_KEY are set. */
  INGEST_EMAIL_DOMAIN: z.string().optional(),
  /** D104: Svix signing secret of the Resend inbound webhook. Never logged. */
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  /** iCloud link of the published "Share to Gobbit" Shortcut, shown in settings. */
  SHORTCUT_URL: z.url().optional(),
  /** D239: HMAC key for `emailHash`/`ipHash` in decision events. Required in production. Never logged. */
  LOG_HASH_KEY: z.string().min(32, 'LOG_HASH_KEY must be at least 32 characters').optional(),
  /** D219: waitlist joins (and confirms) per IP per hour, in memory. */
  WAITLIST_JOIN_PER_IP_PER_HOUR: positiveInt(WAITLIST_JOIN_PER_IP_PER_HOUR),
  /** D219: waitlist joins per email per hour (`rate_limit_counters`). */
  WAITLIST_JOIN_PER_EMAIL_PER_HOUR: positiveInt(WAITLIST_JOIN_PER_EMAIL_PER_HOUR),
});

export const envSchema = baseSchema
  .superRefine((data, ctx) => {
    const require = (key: keyof typeof data, message: string) => {
      if (!data[key]) ctx.addIssue({ code: 'custom', path: [key], message });
    };
    if (data.MAIL_PROVIDER === 'resend') {
      require('RESEND_API_KEY', 'RESEND_API_KEY is required when MAIL_PROVIDER=resend');
      require('MAIL_FROM', 'MAIL_FROM is required when MAIL_PROVIDER=resend');
    }
    if (data.CLOUDINARY_URL !== undefined && cloudNameFrom(data.CLOUDINARY_URL) === null) {
      // Never echo the value: it carries the API secret.
      ctx.addIssue({ code: 'custom', path: ['CLOUDINARY_URL'], message: 'Invalid CLOUDINARY_URL' });
    }
    if (data.NODE_ENV === 'production') {
      require('API_URL', 'API_URL is required in production');
      require('CLOUDINARY_URL', 'CLOUDINARY_URL is required in production');
      require('LOG_HASH_KEY', 'LOG_HASH_KEY is required in production');
      if (data.MAIL_PROVIDER === 'console' && !data.ALLOW_CONSOLE_MAIL) {
        ctx.addIssue({
          code: 'custom',
          path: ['ALLOW_CONSOLE_MAIL'],
          message: 'MAIL_PROVIDER=console in production requires ALLOW_CONSOLE_MAIL=true',
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    API_URL: stripTrailingSlash(data.API_URL ?? `http://localhost:${data.PORT}`),
    APP_URL: data.APP_URL ? stripTrailingSlash(data.APP_URL) : undefined,
    CLIENT_IP_HEADER: data.CLIENT_IP_HEADER?.toLowerCase(),
    LOG_HASH_KEY: data.LOG_HASH_KEY ?? DEV_LOG_HASH_KEY,
  }));

export type Env = z.output<typeof envSchema>;

/** Parses and validates the environment; blank values count as unset (compose passes blanks). */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment: ${messages.join('; ')}`);
  }
  return result.data;
}
