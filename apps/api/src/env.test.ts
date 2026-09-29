import { describe, it, expect } from 'vitest';
import { parseEnv } from './env';

describe('env', () => {
  const validUrl = 'postgresql://localhost/test';

  it('parses minimal config with defaults', () => {
    const env = parseEnv({ DATABASE_URL: validUrl });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.API_URL).toBe('http://localhost:3000');
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.MAIL_PROVIDER).toBe('console');
    expect(env.ALLOW_CONSOLE_MAIL).toBe(false);
    expect(env.MAGIC_LINK_TTL_MINUTES).toBe(15);
    expect(env.INVITE_TTL_DAYS).toBe(7);
    expect(env.SESSION_TTL_DAYS).toBe(90);
  });

  it('computes API_URL based on PORT', () => {
    const env = parseEnv({ DATABASE_URL: validUrl, PORT: '8080' });
    expect(env.API_URL).toBe('http://localhost:8080');
  });

  it('parses CORS_ORIGINS as comma-separated list', () => {
    const env = parseEnv({
      DATABASE_URL: validUrl,
      CORS_ORIGINS: ' https://a.test, ,https://b.test ',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
  });

  it('parses COOKIE_SECURE as boolean', () => {
    const env = parseEnv({
      DATABASE_URL: validUrl,
      COOKIE_SECURE: 'false',
    });
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('throws when MAIL_PROVIDER is resend without RESEND_API_KEY', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: validUrl,
        MAIL_PROVIDER: 'resend',
        MAIL_FROM: 'test@example.com',
      }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('throws when MAIL_PROVIDER is resend without MAIL_FROM', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: validUrl,
        MAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'key',
      }),
    ).toThrow(/MAIL_FROM/);
  });

  it('throws in production with console mail and no ALLOW_CONSOLE_MAIL', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: validUrl,
        NODE_ENV: 'production',
        API_URL: 'https://example.com',
        MAIL_PROVIDER: 'console',
      }),
    ).toThrow(/ALLOW_CONSOLE_MAIL/);
  });

  it('parses production config with console mail and ALLOW_CONSOLE_MAIL', () => {
    const env = parseEnv({
      DATABASE_URL: validUrl,
      NODE_ENV: 'production',
      API_URL: 'https://example.com',
      MAIL_PROVIDER: 'console',
      ALLOW_CONSOLE_MAIL: 'true',
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.MAIL_PROVIDER).toBe('console');
    expect(env.ALLOW_CONSOLE_MAIL).toBe(true);
  });

  it('throws in production without API_URL', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: validUrl,
        NODE_ENV: 'production',
      }),
    ).toThrow(/API_URL/);
  });

  it('ignores DEV_* environment variables', () => {
    const env = parseEnv({
      DATABASE_URL: validUrl,
      DEV_AUTH_ENABLED: 'true',
      DEV_API_TOKEN: 'secret',
    });
    expect(env).not.toHaveProperty('DEV_AUTH_ENABLED');
    expect(env).not.toHaveProperty('DEV_API_TOKEN');
  });

  it('treats empty strings as unset', () => {
    const env = parseEnv({
      DATABASE_URL: validUrl,
      APP_URL: '',
      COOKIE_DOMAIN: '   ',
    });
    expect(env.APP_URL).toBeUndefined();
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  it('throws on invalid DATABASE_URL', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'not-a-url',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('throws when SESSION_TTL_DAYS is 0', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: validUrl,
        SESSION_TTL_DAYS: '0',
      }),
    ).toThrow();
  });

  it('strips trailing slash from API_URL', () => {
    const env = parseEnv({
      DATABASE_URL: validUrl,
      API_URL: 'https://example.com/',
      NODE_ENV: 'production',
      ALLOW_CONSOLE_MAIL: 'true',
    });
    expect(env.API_URL).toBe('https://example.com');
  });

  it('lowercases CLIENT_IP_HEADER', () => {
    const env = parseEnv({
      DATABASE_URL: validUrl,
      CLIENT_IP_HEADER: 'CF-Connecting-IP',
    });
    expect(env.CLIENT_IP_HEADER).toBe('cf-connecting-ip');
  });
});
