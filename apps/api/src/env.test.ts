import { describe, it, expect } from 'vitest';
import { parseEnv } from './env';

describe('env', () => {
  it('minimal valid config defaults correctly', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://pb:pb@localhost:5432/pb',
    });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DEV_AUTH_ENABLED).toBe(false);
  });

  it('PORT coerces string to number', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://pb:pb@localhost:5432/pb',
      PORT: '8080',
    });
    expect(env.PORT).toBe(8080);
  });

  it('DEV_AUTH_ENABLED true with 10-char token throws', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://pb:pb@localhost:5432/pb',
        DEV_AUTH_ENABLED: 'true',
        DEV_API_TOKEN: 'x'.repeat(10),
      }),
    ).toThrow(/at least 32 characters/);
  });

  it('DEV_AUTH_ENABLED true with no token throws', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://pb:pb@localhost:5432/pb',
        DEV_AUTH_ENABLED: 'true',
      }),
    ).toThrow();
  });

  it('DEV_AUTH_ENABLED true with 32-char token succeeds', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://pb:pb@localhost:5432/pb',
      DEV_AUTH_ENABLED: 'true',
      DEV_API_TOKEN: 'x'.repeat(32),
    });
    expect(env.DEV_AUTH_ENABLED).toBe(true);
  });

  it('missing DATABASE_URL throws', () => {
    expect(() => parseEnv({})).toThrow(/Invalid environment/);
  });

  it('DEV_AUTH_ENABLED yes throws', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://pb:pb@localhost:5432/pb',
        DEV_AUTH_ENABLED: 'yes',
      }),
    ).toThrow();
  });
});
