import type { Deck } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import type { AvatarMember } from '../ui/Avatar';
import type { MenuAction } from '../ui/MoreMenu';
import { deckHref } from '../ui/chip-order';

export interface MenuActionsInput {
  /** The deck the page belongs to; absent on the deck list and `/settings`. */
  deck?: Pick<Deck, 'slug' | 'role'>;
  isPlatformAdmin: boolean;
  /** Signed-in email, shown under "Profile"; unknown while `/me` loads. */
  email?: string;
  /** The member's avatar for the Profile item; unknown while `/me` loads. */
  me?: AvatarMember;
  /** D354: opens the About sheet. */
  onAbout: () => void;
  /** Reloads into a waiting new version; present only while one is pending. */
  onUpdate?: (() => void) | null;
}

/**
 * D276: the bottom bar's ⋯ menu, in order: Profile (avatar + email; Sign out lives on the
 * profile page), Settings (one page, D278), Upcoming reminders (`item.update`, 037), Activity
 * (`event.list`, D188), Waitlist (platform admins, 032), About (D354), and last, on an accent
 * fill, Update Gobbit (only while a new version waits).
 */
export function menuActions({
  deck,
  isPlatformAdmin,
  email,
  me,
  onAbout,
  onUpdate,
}: MenuActionsInput): MenuAction[] {
  const actions: MenuAction[] = [];
  actions.push({
    key: 'profile',
    label: 'Profile',
    icon: 'user',
    avatar: me,
    detail: email,
    href: '/settings/profile',
  });
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
  if (onUpdate) {
    actions.push({
      key: 'update',
      label: 'Update Gobbit',
      icon: 'refresh',
      detail: 'A new version is ready',
      tone: 'accent',
      onSelect: onUpdate,
    });
  }
  return actions;
}
