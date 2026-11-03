import { describe, expect, it, vi } from 'vitest';
import { menuActions } from './deck-menu-actions';

const base = { isPlatformAdmin: false, onSignOut: vi.fn() };

describe('menuActions (D276)', () => {
  it('gives deck owners Settings, Activity and Sign out, in order', () => {
    const actions = menuActions({ ...base, deck: { slug: 'family', role: 'owner' } });
    expect(actions.map((a) => a.label)).toEqual(['Settings', 'Activity', 'Sign out']);
    expect(actions[0]?.href).toBe('/d/family/settings');
    expect(actions[1]?.href).toBe('/d/family/log');
  });

  it('hides Activity from editors and readers', () => {
    for (const role of ['editor', 'reader'] as const) {
      const labels = menuActions({ ...base, deck: { slug: 'family', role } }).map((a) => a.label);
      expect(labels).toEqual(['Settings', 'Sign out']);
    }
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
