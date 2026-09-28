import { z } from 'zod';

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  DEV_AUTH_ENABLED: boolean;
  DEV_API_TOKEN?: string;
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    DEV_AUTH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    DEV_API_TOKEN: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.DEV_AUTH_ENABLED && (!data.DEV_API_TOKEN || data.DEV_API_TOKEN.length < 32)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_API_TOKEN'],
        message: 'DEV_API_TOKEN must be at least 32 characters when DEV_AUTH_ENABLED=true',
      });
    }
  });

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message);
    throw new Error(`Invalid environment: ${messages.join('; ')}`);
  }
  return result.data;
}
