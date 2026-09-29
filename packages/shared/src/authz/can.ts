import { type MemberRole } from '../enums';
import { type Permission } from './permissions';

export const PERMISSION_MATRIX: Readonly<Record<Permission, readonly MemberRole[]>> = {
  'deck.read': ['owner', 'maintainer', 'editor', 'reader'],
  'deck.update': ['owner', 'maintainer'],
  'deck.delete': ['owner'],
  'category.read': ['owner', 'maintainer', 'editor', 'reader'],
  'category.read_private': ['owner', 'maintainer'],
  'category.create': ['owner', 'maintainer', 'editor'],
  'category.update': ['owner', 'maintainer'],
  'item.read': ['owner', 'maintainer', 'editor', 'reader'],
  'item.create': ['owner', 'maintainer', 'editor'],
  'item.update': ['owner', 'maintainer', 'editor'],
  'item.archive': ['owner', 'maintainer', 'editor'],
  'item.delete': ['owner', 'maintainer'],
  'item.publish': ['owner', 'maintainer'],
  'item.favorite': ['owner', 'maintainer', 'editor', 'reader'],
  'member.list': ['owner', 'maintainer', 'editor', 'reader'],
  'member.invite': ['owner'],
  'member.remove': ['owner'],
};

/** Pure, table-driven permission check. */
export function can(role: MemberRole, permission: Permission): boolean {
  return PERMISSION_MATRIX[permission].includes(role);
}
