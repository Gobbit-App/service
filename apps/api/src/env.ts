import { z } from 'zod';
import {
  MAGIC_LINK_TTL_MINUTES_DEFAULT,
  INVITE_TTL_DAYS_DEFAULT,
  SESSION_TTL_DAYS_DEFAULT,
} from '@pb/shared';
import { cloudNameFrom } from './lib/cloudinary-url';

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const bool = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

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
