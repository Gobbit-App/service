import { can, type MemberRole, type Permission } from '@pb/shared';
import type { MembershipRow } from '@pb/db';
import type { CurrentUser } from '../types';
import { forbidden, notFound } from '../errors/http-errors';

type RoleMembership = Pick<MembershipRow, 'role' | 'acceptedAt'> & {
  deletedAt?: Date | null;
};

/**
 * D33: users of the deck's owner account are its implicit owner (a stray membership row
 * doesn't change that); otherwise the accepted, live membership's role; else no role.
 */
export function resolveRole(
  user: Pick<CurrentUser, 'accountId'>,
  deck: { ownerAccountId: string },
  membership: RoleMembership | null,
): MemberRole | null {
  if (deck.ownerAccountId === user.accountId) {
    return 'owner';
  }
  if (!membership || membership.acceptedAt === null || membership.deletedAt) {
    return null;
  }
  return membership.role;
}

/** D35: no role → 404 (existence isn't leaked); a role without `permission` → 403. */
export function assertPermission(
  role: MemberRole | null,
  permission: Permission,
  notFoundDetail = 'Deck not found',
): MemberRole {
  if (role === null) {
    throw notFound(notFoundDetail);
  }
  if (!can(role, permission)) {
    throw forbidden(permission, role);
  }
  return role;
}

export interface MembershipLookup {
  findActive(deckId: string, userId: string): Promise<RoleMembership | null>;
}

/** Resolves the caller's role on `deck` and asserts `permission`; returns the role. */
export async function authorize(
  user: CurrentUser,
  deck: { id: string; ownerAccountId: string },
  permission: Permission,
  memberships: MembershipLookup,
  notFoundDetail?: string,
): Promise<MemberRole> {
  const membership =
    deck.ownerAccountId === user.accountId ? null : await memberships.findActive(deck.id, user.id);
  return assertPermission(resolveRole(user, deck, membership), permission, notFoundDetail);
}
