import { describe, it, expect } from 'vitest';
import { OWNER_ACCOUNT_ID, OWNER_USER_ID, parseOwnerSeedEnv, seedId } from './owner';

describe('parseOwnerSeedEnv', () => {
  it('refuses a missing SEED_OWNER_EMAIL', () => {
    expect(() => parseOwnerSeedEnv({})).toThrow(/SEED_OWNER_EMAIL is required/);
    expect(() => parseOwnerSeedEnv({ SEED_OWNER_EMAIL: '  ' })).toThrow(/SEED_OWNER_EMAIL/);
  });

  it('refuses a malformed email', () => {
    expect(() => parseOwnerSeedEnv({ SEED_OWNER_EMAIL: 'not-an-email' })).toThrow(/email/);
  });

  it('lowercases the email and derives the name from the local part', () => {
    expect(parseOwnerSeedEnv({ SEED_OWNER_EMAIL: ' Owner.Name@Example.TEST ' })).toEqual({
      email: 'owner.name@example.test',
      name: 'owner.name',
      smokeToken: undefined,
    });
  });

  it('uses SEED_OWNER_NAME when given', () => {
    const cfg = parseOwnerSeedEnv({ SEED_OWNER_EMAIL: 'a@b.test', SEED_OWNER_NAME: 'Yoav' });
    expect(cfg.name).toBe('Yoav');
  });

  it('rejects a smoke token shorter than 32 characters', () => {
    expect(() =>
      parseOwnerSeedEnv({ SEED_OWNER_EMAIL: 'a@b.test', SMOKE_SESSION_TOKEN: 'short' }),
    ).toThrow(/at least 32/);
  });

  it('accepts a long enough smoke token and treats empty as unset', () => {
    const token = 't'.repeat(43);
    expect(
      parseOwnerSeedEnv({ SEED_OWNER_EMAIL: 'a@b.test', SMOKE_SESSION_TOKEN: token }).smokeToken,
    ).toBe(token);
    expect(
      parseOwnerSeedEnv({ SEED_OWNER_EMAIL: 'a@b.test', SMOKE_SESSION_TOKEN: '' }).smokeToken,
    ).toBeUndefined();
  });
});

describe('seed ids', () => {
  it('are deterministic uuid v5 values', () => {
    expect(seedId('owner')).toBe(OWNER_ACCOUNT_ID);
    expect(OWNER_USER_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(OWNER_USER_ID).not.toBe(OWNER_ACCOUNT_ID);
  });
});
