import { describe, it, expect } from 'vitest';
import { resolveE2eEnv } from './env';

describe('resolveE2eEnv', () => {
  it('uses local defaults when nothing is set', () => {
    expect(resolveE2eEnv({})).toEqual({
      baseURL: 'http://localhost:3000',
      token: '',
      webBaseURL: 'http://localhost:5173',
    });
  });

  it('treats empty and whitespace values as unset (GitHub Actions unset vars)', () => {
    expect(resolveE2eEnv({ BASE_URL: '', SMOKE_SESSION_TOKEN: '  ', WEB_BASE_URL: ' ' })).toEqual({
      baseURL: 'http://localhost:3000',
      token: '',
      webBaseURL: 'http://localhost:5173',
    });
  });

  it('uses provided values and strips trailing slashes', () => {
    expect(
      resolveE2eEnv({
        BASE_URL: 'https://api.example.com/',
        SMOKE_SESSION_TOKEN: 'tok',
      }),
    ).toEqual({
      baseURL: 'https://api.example.com',
      token: 'tok',
      webBaseURL: 'http://localhost:5173',
    });
  });

  it('fails fast in CI when BASE_URL is missing', () => {
    expect(() => resolveE2eEnv({ CI: 'true', BASE_URL: '' })).toThrow(/API_BASE_URL/);
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

  it('derives the web origin from a deployed /api base URL (D51)', () => {
    expect(resolveE2eEnv({ BASE_URL: 'https://gobbit.example/api/' }).webBaseURL).toBe(
      'https://gobbit.example',
    );
  });

  it('prefers an explicit WEB_BASE_URL and validates it', () => {
    expect(
      resolveE2eEnv({ BASE_URL: 'https://gobbit.example/api', WEB_BASE_URL: 'http://web:8080/' })
        .webBaseURL,
    ).toBe('http://web:8080');
    expect(() => resolveE2eEnv({ WEB_BASE_URL: 'nope' })).toThrow(/WEB_BASE_URL is not a valid/);
  });
});
