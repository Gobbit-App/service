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
    expect(unauthorizedRedirect({ pathname: '/d/family', search: '?x=1' })).toEqual({
      href: `/sign-in?next=${encodeURIComponent('/d/family?x=1')}`,
      full: false,
    });
    expect(unauthorizedRedirect({ pathname: '/d/x', search: '' })).toEqual({
      href: `/sign-in?next=${encodeURIComponent('/d/x')}`,
      full: false,
    });
  });

  it('sends the signed-out home to the landing page with a full navigation (D227)', () => {
    expect(unauthorizedRedirect({ pathname: '/', search: '' })).toEqual({
      href: '/welcome?from=app',
      full: true,
    });
    expect(unauthorizedRedirect({ pathname: '/', search: '?utm_source=x' })).toEqual({
      href: '/welcome?from=app&utm_source=x',
      full: true,
    });
  });

  it('a home with other query parameters still goes to sign-in', () => {
    expect(unauthorizedRedirect({ pathname: '/', search: '?q=milk' })).toEqual({
      href: `/sign-in?next=${encodeURIComponent('/?q=milk')}`,
      full: false,
    });
  });

  it('keeps the public paths unchanged', () => {
    expect(isPublicPath('/welcome')).toBe(false);
    expect(unauthorizedRedirect({ pathname: '/auth/error', search: '?reason=closed' })).toBeNull();
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
    const clearDrafts = vi.fn().mockResolvedValue(undefined);

    await signOut({ queryClient, removePersisted, clearDrafts, logout });

    expect(logout).toHaveBeenCalled();
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
    expect(localStorage.getItem(LAST_DECK_KEY)).toBeNull();
    expect(removePersisted).toHaveBeenCalled();
    expect(clearDrafts).toHaveBeenCalled();
  });

  it('still clears local data when logout fails', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['me'], { user: { id: 'u' } });
    const removePersisted = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    const clearDrafts = vi.fn().mockResolvedValue(undefined);
    await signOut({
      queryClient,
      removePersisted,
      clearDrafts,
      logout: () => Promise.reject(new TypeError('offline')),
      log,
    });

    expect(log).toHaveBeenCalled();
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
    expect(removePersisted).toHaveBeenCalled();
    expect(clearDrafts).toHaveBeenCalled();
  });

  it('clears the drafts even when the persisted cache cannot be removed', async () => {
    const clearDrafts = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await signOut({
      queryClient: new QueryClient(),
      removePersisted: () => Promise.reject(new Error('idb blocked')),
      clearDrafts,
      logout: vi.fn().mockResolvedValue(undefined),
      log,
    });

    expect(clearDrafts).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      '[session] could not clear the persisted cache',
      expect.any(Error),
    );
  });
});
