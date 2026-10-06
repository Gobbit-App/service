import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAST_DECK_KEY } from '../lib/last-deck';

vi.mock('./client', () => ({ api: {}, unwrap: vi.fn() }));
const { isPublicPath, signOut, unauthorizedRedirect } = await import('./session');

describe('isPublicPath / unauthorizedRedirect', () => {
  it('treats sign-in and auth error pages as public', () => {
    expect(isPublicPath('/sign-in')).toBe(true);
    expect(isPublicPath('/auth/error')).toBe(true);
    expect(isPublicPath('/d/family')).toBe(false);
    expect(unauthorizedRedirect({ pathname: '/sign-in', search: '' })).toBeNull();
  });

  it('sends private pages to sign-in with the return path', () => {
    expect(unauthorizedRedirect({ pathname: '/d/family', search: '?x=1' })).toBe(
      `/sign-in?next=${encodeURIComponent('/d/family?x=1')}`,
    );
  });
});

describe('signOut', () => {
  afterEach(() => localStorage.clear());

  it('clears the cache, last deck and persisted data', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['me'], { user: { id: 'u' } });
    localStorage.setItem(LAST_DECK_KEY, 'family');
    const removePersisted = vi.fn().mockResolvedValue(undefined);
    const logout = vi.fn().mockResolvedValue(undefined);

    await signOut({ queryClient, removePersisted, logout });

    expect(logout).toHaveBeenCalled();
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
    expect(localStorage.getItem(LAST_DECK_KEY)).toBeNull();
    expect(removePersisted).toHaveBeenCalled();
  });

  it('still clears local data when logout fails', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['me'], { user: { id: 'u' } });
    const removePersisted = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await signOut({
      queryClient,
      removePersisted,
      logout: () => Promise.reject(new TypeError('offline')),
      log,
    });

    expect(log).toHaveBeenCalled();
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
    expect(removePersisted).toHaveBeenCalled();
  });
});
