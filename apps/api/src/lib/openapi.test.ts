import { describe, it, expect } from 'vitest';
import { problemSchema } from '@pb/shared';
import { AUTH_SECURITY, problems } from './openapi';

describe('AUTH_SECURITY', () => {
  it('accepts the session cookie or a bearer token', () => {
    expect(AUTH_SECURITY).toEqual([{ SessionCookie: [] }, { BearerToken: [] }]);
  });
});

describe('problems', () => {
  it('maps codes to statuses with problem+json content and descriptions', () => {
    const res = problems('unauthorized', 'not-found', 'rate-limited');
    expect(Object.keys(res).sort()).toEqual(['401', '404', '429']);
    expect(res[401].description).toBe('Unauthorized');
    expect(res[404].description).toBe('Not Found');
    expect(res[429].description).toBe('Too Many Requests');
    expect(res[404].content['application/problem+json'].schema).toBe(problemSchema);
  });

  it.each([
    ['bad-request', 400],
    ['validation', 400],
    ['forbidden', 403],
    ['conflict', 409],
    ['unprocessable', 422],
  ] as const)('%s -> %i', (code, status) => {
    expect(problems(code)[status]).toBeDefined();
  });

  it('collapses codes sharing a status', () => {
    expect(Object.keys(problems('bad-request', 'validation'))).toEqual(['400']);
  });

  it('returns an empty object for no codes', () => {
    expect(problems()).toEqual({});
  });
});
