import type { MemberRole } from '@pb/shared';
import { resolveRole, type MembershipLookup } from '../access/authorize';
import type { DecksRepo } from '../repositories/decks.repo';
import type { UsersRepo } from '../repositories/users.repo';

/**
 * D33 for the worker: the sharer's role on the deck when the job runs (membership may have
 * changed since the share). Null when the user, the deck or the membership is gone.
 */
export function createSharerRole(deps: {
  users: Pick<UsersRepo, 'findById'>;
  decks: Pick<DecksRepo, 'findById'>;
  memberships: MembershipLookup;
}) {
  return async function roleOf(deckId: string, userId: string): Promise<MemberRole | null> {
    const [user, deck] = await Promise.all([
      deps.users.findById(userId),
      deps.decks.findById(deckId),
    ]);
    if (!user || !deck) return null;
    const membership =
      deck.ownerAccountId === user.accountId
        ? null
        : await deps.memberships.findActive(deck.id, user.id);
    return resolveRole(user, deck, membership);
  };
}
