import { PERSONAL_DECK_NAME } from '@pb/shared';
import type { RegistrationMode, RegistrationReason } from '@pb/shared/auth';
import type { DeckRow } from '@pb/db';
import type { UsersRepo } from '../repositories/users.repo';
import type { DecksRepo } from '../repositories/decks.repo';
import type { CurrentUser } from '../types';
import type { LogHash } from '../lib/log-hash';
import { decisionLogger, type DecisionLogger } from '../lib/decision-event';
import { AUTH_DECISION_LEVELS, type AuthDecisions } from './auth.events';

const UNIQUE_VIOLATION = '23505';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** `display_name` for a user created from an email alone: its local part (D25). */
export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0];
  return local.length > 0 ? local : email;
}

function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return (
    code(err) === UNIQUE_VIOLATION || code((err as { cause?: unknown })?.cause) === UNIQUE_VIOLATION
  );
}

/** D222: thrown by `register` for `open_sign_in` while the mode is `waitlist`. */
export class RegistrationClosed extends Error {
  constructor() {
    super('Registration is closed');
    this.name = 'RegistrationClosed';
  }
}

export function createUsersService({
  users,
  decks,
  mode,
  logHash,
  decisions = decisionLogger<AuthDecisions>('users', { levels: AUTH_DECISION_LEVELS }),
}: {
  users: Pick<UsersRepo, 'findByEmail' | 'createWithAccount'>;
  decks: Pick<DecksRepo, 'ensureDefault'>;
  mode: RegistrationMode;
  logHash: LogHash;
  decisions?: DecisionLogger<AuthDecisions>;
}) {
  const findByEmail = (email: string) => users.findByEmail(normalizeEmail(email));

  return {
    findByEmail,

    /** D222: lookup only, never creates (sign-in request and callback). */
    findExisting: findByEmail,

    /**
     * Phase 3B: every user has exactly one personal deck. Runs on every sign-in and invite
     * callback (inside the callback transaction, before the session opens), so it also covers
     * users created before this phase. Idempotent ("ensure", not "create"). It supersedes
     * D25's "no deck is auto-created".
     */
    async ensurePersonalDeck(user: CurrentUser): Promise<DeckRow> {
      return decks.ensureDefault({ accountId: user.accountId, name: PERSONAL_DECK_NAME });
    },

    /**
     * D25/D241: the single place where users come into existence. `open_sign_in` is refused
     * while the mode is `waitlist` (D222); invites always register. Stores why and by whom.
     * A concurrent insert of the same email loses the unique index race and falls back to
     * reading the winner. Records `users.register`.
     */
    async register(
      rawEmail: string,
      reason: RegistrationReason,
      ctx: { requestId: string; actorId?: string },
    ): Promise<{ user: CurrentUser; created: boolean }> {
      const email = normalizeEmail(rawEmail);
      const fields = {
        via: reason,
        actorId: ctx.actorId,
        emailHash: logHash('email', email),
        requestId: ctx.requestId,
      };
      const existing = await users.findByEmail(email);
      if (existing) {
        decisions.record('users.register', { outcome: 'existing', userId: existing.id, ...fields });
        return { user: existing, created: false };
      }
      if (reason === 'open_sign_in' && mode === 'waitlist') {
        decisions.record('users.register', {
          outcome: 'refused',
          reason: 'registration_closed',
          ...fields,
        });
        throw new RegistrationClosed();
      }
      try {
        const user = await users.createWithAccount({
          email,
          displayName: displayNameFromEmail(email),
          via: reason,
          by: ctx.actorId ?? null,
        });
        decisions.record('users.register', { outcome: 'created', userId: user.id, ...fields });
        return { user, created: true };
      } catch (err) {
        if (!isUniqueViolation(err)) {
          throw err;
        }
        const winner = await users.findByEmail(email);
        if (!winner) {
          throw err;
        }
        decisions.record('users.register', { outcome: 'existing', userId: winner.id, ...fields });
        return { user: winner, created: false };
      }
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
