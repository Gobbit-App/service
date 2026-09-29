import type { Action, CurrentUser } from '../types';
import { notFound } from '../errors/http-errors';

/**
 * Asserts that the current user has access to the given deck.
 * Phase 2 will replace this with a more sophisticated can() function.
 */
export function assertDeckAccess(
  user: CurrentUser,
  deck: { ownerAccountId: string },
  action: Action,
): void {
  void action;

  if (deck.ownerAccountId !== user.accountId) {
    throw notFound('Deck not found');
  }
}
