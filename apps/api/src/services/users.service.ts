import type { UsersRepo } from '../repositories/users.repo';
import type { CurrentUser } from '../types';

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

export function createUsersService({ users }: { users: UsersRepo }) {
  return {
    findByEmail: (email: string) => users.findByEmail(normalizeEmail(email)),

    /**
     * D25: the single place where users come into existence (sign-in callback and invites).
     * Phase 9 gates registration here. A concurrent insert of the same email loses the
     * unique index race and falls back to reading the winner.
     */
    async findOrCreateByEmail(rawEmail: string): Promise<{ user: CurrentUser; created: boolean }> {
      const email = normalizeEmail(rawEmail);
      const existing = await users.findByEmail(email);
      if (existing) {
        return { user: existing, created: false };
      }
      try {
        const user = await users.createWithAccount({
          email,
          displayName: displayNameFromEmail(email),
        });
        return { user, created: true };
      } catch (err) {
        if (!isUniqueViolation(err)) {
          throw err;
        }
        const winner = await users.findByEmail(email);
        if (!winner) {
          throw err;
        }
        return { user: winner, created: false };
      }
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
