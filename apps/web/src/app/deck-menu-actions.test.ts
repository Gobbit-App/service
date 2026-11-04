import { describe, expect, it, vi } from 'vitest';
import { menuActions } from './deck-menu-actions';

const base = { isPlatformAdmin: false, onSignOut: vi.fn() };

describe('menuActions (D276)', () => {
  it('gives deck owners Settings, Upcoming, Activity and Sign out, in order', () => {
    const actions = menuActions({ ...base, deck: { slug: 'family', role: 'owner' } });
    expect(actions.map((a) => a.label)).toEqual(['Settings', 'Upcoming', 'Activity', 'Sign out']);
    expect(actions[0]?.href).toBe('/d/family/settings');
    expect(actions[1]?.href).toBe('/d/family/upcoming');
    expect(actions[2]?.href).toBe('/d/family/log');
  });

  it('gives editors Upcoming (their own reminders) but not Activity', () => {
    const labels = menuActions({ ...base, deck: { slug: 'family', role: 'editor' } }).map(
      (a) => a.label,
    );
    expect(labels).toEqual(['Settings', 'Upcoming', 'Sign out']);
  });

  it('hides Upcoming and Activity from readers', () => {
    const labels = menuActions({ ...base, deck: { slug: 'family', role: 'reader' } }).map(
      (a) => a.label,
    );
    expect(labels).toEqual(['Settings', 'Sign out']);
  });

  it('opens account settings off a deck', () => {
    const [settings] = menuActions(base);
    expect(settings?.href).toBe('/settings');
  });

  it('adds Waitlist for platform admins', () => {
    const labels = menuActions({ ...base, isPlatformAdmin: true }).map((a) => a.label);
    expect(labels).toEqual(['Settings', 'Waitlist', 'Sign out']);
  });

  it('shows the email under Sign out and runs the sign-out', () => {
    const onSignOut = vi.fn();
    const signOut = menuActions({ ...base, email: 'me@example.com', onSignOut }).at(-1);
    expect(signOut?.detail).toBe('me@example.com');
    signOut?.onSelect?.();
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('disables Sign out while signing out', () => {
    expect(menuActions({ ...base, signingOut: true }).at(-1)?.disabledReason).toBeTruthy();
  });
});
