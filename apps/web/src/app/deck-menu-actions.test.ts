import { describe, expect, it, vi } from 'vitest';
import { menuActions } from './deck-menu-actions';

const base = { isPlatformAdmin: false, onAbout: vi.fn() };

describe('menuActions (D276)', () => {
  it('gives deck owners Profile, Settings, Upcoming, Activity and About, in order', () => {
    const actions = menuActions({ ...base, deck: { slug: 'family', role: 'owner' } });
    expect(actions.map((a) => a.label)).toEqual([
      'Profile',
      'Settings',
      'Upcoming',
      'Activity',
      'About',
    ]);
    expect(actions[1]?.href).toBe('/d/family/settings');
    expect(actions[2]?.href).toBe('/d/family/upcoming');
    expect(actions[3]?.href).toBe('/d/family/log');
  });

  it('gives editors Upcoming (their own reminders) but not Activity', () => {
    const labels = menuActions({ ...base, deck: { slug: 'family', role: 'editor' } }).map(
      (a) => a.label,
    );
    expect(labels).toEqual(['Profile', 'Settings', 'Upcoming', 'About']);
  });

  it('hides Upcoming and Activity from readers', () => {
    const labels = menuActions({ ...base, deck: { slug: 'family', role: 'reader' } }).map(
      (a) => a.label,
    );
    expect(labels).toEqual(['Profile', 'Settings', 'About']);
  });

  it('opens account settings off a deck', () => {
    const settings = menuActions(base).find((a) => a.key === 'settings');
    expect(settings?.href).toBe('/settings');
  });

  it('adds Waitlist for platform admins', () => {
    const labels = menuActions({ ...base, isPlatformAdmin: true }).map((a) => a.label);
    expect(labels).toEqual(['Profile', 'Settings', 'Waitlist', 'About']);
  });

  it('opens the profile with the avatar and the email, and has no Sign out', () => {
    const me = { id: 'u1', initials: 'AB' };
    const actions = menuActions({ ...base, email: 'me@example.com', me });
    expect(actions[0]).toMatchObject({
      key: 'profile',
      href: '/settings/profile',
      detail: 'me@example.com',
      avatar: me,
    });
    expect(actions.some((a) => a.key === 'sign-out')).toBe(false);
  });

  it('opens About last without a pending update (D354)', () => {
    const onAbout = vi.fn();
    const about = menuActions({ ...base, onAbout }).at(-1);
    expect(about).toMatchObject({ key: 'about', label: 'About', icon: 'info' });
    about?.onSelect?.();
    expect(onAbout).toHaveBeenCalledOnce();
  });

  it('puts Update Gobbit last, on the accent, only while a new version is pending', () => {
    expect(menuActions(base).some((a) => a.key === 'update')).toBe(false);
    const onUpdate = vi.fn();
    const last = menuActions({ ...base, onUpdate }).at(-1);
    expect(last).toMatchObject({
      key: 'update',
      label: 'Update Gobbit',
      icon: 'refresh',
      tone: 'accent',
    });
    last?.onSelect?.();
    expect(onUpdate).toHaveBeenCalledOnce();
  });
});
