import type { Deck } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import type { MenuAction } from '../ui/MoreMenu';
import { deckHref } from '../ui/chip-order';

/**
 * D275: the bottom bar's create menu ("Add"), in order. Same role rules and targets as the old
 * deck-actions row: New card, Paste or share and Shares need `item.create` (D108, D198);
 * Import needs `item.publish` (D189). Readers get none, so the + is not rendered.
 */
export function createActions(deck: Pick<Deck, 'slug' | 'role'>): MenuAction[] {
  const { slug, role } = deck;
  if (!can(role, 'item.create')) return [];
  const actions: MenuAction[] = [
    { key: 'new', label: 'New card', icon: 'plus', href: deckHref(slug, 'new') },
    {
      key: 'paste',
      label: 'Paste or share',
      icon: 'clipboard',
      href: `/share?deck=${encodeURIComponent(slug)}`,
    },
  ];
  if (can(role, 'item.publish')) {
    actions.push({
      key: 'import',
      label: 'Import',
      icon: 'file-import',
      href: deckHref(slug, 'import'),
    });
  }
  actions.push({ key: 'shares', label: 'Shares', icon: 'send', href: deckHref(slug, 'shares') });
  return actions;
}
