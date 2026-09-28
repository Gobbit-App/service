import { describe, it, expect } from 'vitest';
import { resolveE2eEnv } from './env';

describe('resolveE2eEnv', () => {
  it('uses local defaults when nothing is set', () => {
    expect(resolveE2eEnv({})).toEqual({
      baseURL: 'http://localhost:3000',
      token: '',
      user: 'dev@example.test',
    });
  });

  it('treats empty and whitespace values as unset (GitHub Actions unset vars)', () => {
    expect(resolveE2eEnv({ BASE_URL: '', DEV_API_TOKEN: '  ', DEV_USER: '' })).toEqual({
      baseURL: 'http://localhost:3000',
      token: '',
      user: 'dev@example.test',
    });
  });

  it('uses provided values and strips trailing slashes', () => {
    expect(
      resolveE2eEnv({
        BASE_URL: 'https://api.example.com/',
        DEV_API_TOKEN: 'tok',
        DEV_USER: 'a@example.test',
      }),
    ).toEqual({ baseURL: 'https://api.example.com', token: 'tok', user: 'a@example.test' });
  });

  it('fails fast in CI when BASE_URL is missing', () => {
    expect(() => resolveE2eEnv({ CI: 'true', BASE_URL: '' })).toThrow(/BASE_URL is not set/);
  });

  it('allows CI when BASE_URL is set', () => {
    expect(resolveE2eEnv({ CI: 'true', BASE_URL: 'http://api:3000' }).baseURL).toBe(
      'http://api:3000',
    );
  });

  it('rejects an invalid URL', () => {
    expect(() => resolveE2eEnv({ BASE_URL: '/health' })).toThrow(/not a valid URL/);
  });

  it('rejects a non-http protocol', () => {
    expect(() => resolveE2eEnv({ BASE_URL: 'ftp://api.example.com' })).toThrow(/http or https/);
  });
});
