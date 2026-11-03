import { describe, expect, it } from 'vitest';
import { promptAllowedOn } from './prompt-routes';

describe('promptAllowedOn (D263)', () => {
  it.each(['/', '/d/$slug/', '/i/$itemId', '/settings', '/d/$slug/search'])('shows on %s', (id) => {
    expect(promptAllowedOn(id)).toBe(true);
  });

  it.each([
    '/sign-in',
    '/auth/error',
    '/i/$itemId_/edit',
    '/d/$slug/new',
    '/d/$slug/browse',
    '__root__',
    undefined,
  ])('never on %s', (id) => {
    expect(promptAllowedOn(id)).toBe(false);
  });
});
