import { v5 } from 'uuid';
import { z } from 'zod';
import { MIN_SEEDED_TOKEN_LENGTH } from '@pb/shared';

export const SEED_NAMESPACE = '6f1c2b1e-4a53-4b8e-9d5e-2a7c9f0e1b3d';

export function seedId(key: string): string {
  return v5(key, SEED_NAMESPACE);
}

/** Stable ids so re-running the seed upserts instead of inserting (D49). */
export const OWNER_ACCOUNT_ID = seedId('owner');
export const OWNER_USER_ID = seedId('owner/user');
export const SMOKE_SESSION_ID = seedId('owner/smoke-session');

export interface OwnerSeedConfig {
  email: string;
  name: string;
  /** D43: when set, one long-lived bearer session is upserted for the owner. */
  smokeToken?: string;
}

const seedEnvSchema = z.object({
  SEED_OWNER_EMAIL: z
    .string({ error: 'SEED_OWNER_EMAIL is required' })
    .trim()
    .toLowerCase()
    .pipe(z.email('SEED_OWNER_EMAIL must be an email address')),
  SEED_OWNER_NAME: z.string().trim().min(1).optional(),
  SMOKE_SESSION_TOKEN: z
    .string()
    .min(
      MIN_SEEDED_TOKEN_LENGTH,
      `SMOKE_SESSION_TOKEN must be at least ${MIN_SEEDED_TOKEN_LENGTH} characters`,
    )
    .optional(),
});

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

/** Reads the owner seed configuration; throws with a readable message when invalid. */
export function parseOwnerSeedEnv(env: Record<string, string | undefined>): OwnerSeedConfig {
  const result = seedEnvSchema.safeParse({
    SEED_OWNER_EMAIL: emptyToUndefined(env.SEED_OWNER_EMAIL),
    SEED_OWNER_NAME: emptyToUndefined(env.SEED_OWNER_NAME),
    SMOKE_SESSION_TOKEN: emptyToUndefined(env.SMOKE_SESSION_TOKEN),
  });
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join('; ');
    throw new Error(`Invalid seed environment: ${message}`);
  }
  const { SEED_OWNER_EMAIL: email, SEED_OWNER_NAME, SMOKE_SESSION_TOKEN } = result.data;
  return {
    email,
    name: SEED_OWNER_NAME ?? email.split('@')[0],
    smokeToken: SMOKE_SESSION_TOKEN,
  };
}
