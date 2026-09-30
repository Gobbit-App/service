import { describe, it, expect } from 'vitest';
import { can, PERMISSION_MATRIX } from './can';
import { permissions } from './permissions';
import { memberRoles } from '../enums';
import type { Permission } from './permissions';

describe('can (authz)', () => {
  // Expected table: permission -> [owner, maintainer, editor, reader]
  const expectedTable: Record<Permission, [boolean, boolean, boolean, boolean]> = {
    'deck.read': [true, true, true, true],
    'deck.update': [true, true, false, false],
    'deck.delete': [true, false, false, false],
    'category.read': [true, true, true, true],
    'category.read_private': [true, true, false, false],
    'category.create': [true, true, true, false],
    'category.update': [true, true, false, false],
    'item.read': [true, true, true, true],
    'item.create': [true, true, true, false],
    'item.update': [true, true, true, false],
    'item.archive': [true, true, true, false],
    'item.delete': [true, true, false, false],
    'item.publish': [true, true, false, false],
    'item.favorite': [true, true, true, true],
    'member.list': [true, true, true, true],
    'member.invite': [true, false, false, false],
    'member.remove': [true, false, false, false],
  };

  console.table(expectedTable);

  it('permissions should have 17 unique entries', () => {
    expect(permissions).toHaveLength(17);
    expect(new Set(permissions).size).toBe(17);
  });

  it('PERMISSION_MATRIX keys should equal permissions', () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual([...permissions].sort());
  });

  it('owner can do everything', () => {
    permissions.forEach((perm) => {
      expect(can('owner', perm)).toBe(true);
    });
  });

  it.each(
    permissions.flatMap((permission) =>
      memberRoles.map(
        (role, roleIndex) =>
          [
            `${role} ${permission} -> ${expectedTable[permission][roleIndex]}`,
            role,
            permission,
            expectedTable[permission][roleIndex],
          ] as const,
      ),
    ),
  )('%s', (_, role, permission, expected) => {
    expect(can(role, permission)).toBe(expected);
  });
});
