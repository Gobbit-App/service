import type { Deck } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import type { MenuAction } from '../ui/MoreMenu';
import { deckHref } from '../ui/chip-order';

export interface MenuActionsInput {
  /** The deck the page belongs to; absent on the deck list and `/settings`. */
  deck?: Pick<Deck, 'slug' | 'role'>;
  isPlatformAdmin: boolean;
  /** Signed-in email, shown under "Sign out"; unknown while `/me` loads. */
  email?: string;
  /** D354: opens the About sheet. */
  onAbout: () => void;
  onSignOut: () => void;
  signingOut?: boolean;
  /** Reloads into a waiting new version; present only while one is pending. */
  onUpdate?: (() => void) | null;
}

/**
 * D276: the bottom bar's ⋯ menu, in order: Update Gobbit (only while a new version waits),
 * Settings (one page, D278), Upcoming reminders
 * (`item.update`, 037), Activity (`event.list`, D188), Waitlist (platform admins, 032), About
 * (D354) and Sign out with the signed-in email.
 */
export function menuActions({
  deck,
  isPlatformAdmin,
  email,
  onAbout,
  onSignOut,
  signingOut = false,
  onUpdate,
}: MenuActionsInput): MenuAction[] {
  const actions: MenuAction[] = [];
  if (onUpdate) {
    actions.push({
      key: 'update',
      label: 'Update Gobbit',
      icon: 'refresh',
      detail: 'A new version is ready',
      onSelect: onUpdate,
    });
  }
  actions.push({
    key: 'settings',
    label: 'Settings',
    icon: 'settings',
    href: deck ? deckHref(deck.slug, 'settings') : '/settings',
  });
  if (deck && can(deck.role, 'item.update')) {
    actions.push({
      key: 'upcoming',
      label: 'Upcoming',
      icon: 'clock',
      href: deckHref(deck.slug, 'upcoming'),
    });
  }
  if (deck && can(deck.role, 'event.list')) {
    actions.push({
      key: 'activity',
      label: 'Activity',
      icon: 'history',
      href: deckHref(deck.slug, 'log'),
    });
  }
  if (isPlatformAdmin) {
    actions.push({ key: 'waitlist', label: 'Waitlist', icon: 'list', href: '/admin/waitlist' });
  }
  actions.push({ key: 'about', label: 'About', icon: 'info', onSelect: onAbout });
  actions.push({
    key: 'sign-out',
    label: 'Sign out',
    icon: 'sign-out',
    detail: email,
    onSelect: onSignOut,
    disabledReason: signingOut ? 'Signing out…' : null,
  });
  return actions;
}
