import type { Action, CurrentUser } from '../types';
import { notFound } from '../errors/http-errors';

/**
 * Asserts that the current user has access to the given pocketbook.
 * Phase 2 will replace this with a more sophisticated can() function.
 */
export function assertPocketbookAccess(
  user: CurrentUser,
  pocketbook: { ownerAccountId: string },
  action: Action,
): void {
  void action;

  if (pocketbook.ownerAccountId !== user.accountId) {
    throw notFound('Pocketbook not found');
  }
}
