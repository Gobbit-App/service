import { and, asc, eq, isNull } from 'drizzle-orm';
import { accounts, analyticsConsentEvents, users } from '@gobbit/db';
import type { DbExecutor } from '@gobbit/db';
import type { RegistrationReason } from '@gobbit/shared/auth';
import type { AnalyticsConsentChoice, AnalyticsConsentSource } from '@gobbit/shared/analytics';
import type { CurrentUser } from '../types';

const currentUserColumns = {
  id: users.id,
  accountId: users.accountId,
  email: users.email,
  displayName: users.displayName,
};

const consentColumns = {
  analyticsConsent: users.analyticsConsent,
  analyticsConsentAt: users.analyticsConsentAt,
  analyticsConsentSource: users.analyticsConsentSource,
};

export type StoredAnalyticsConsent = {
  analyticsConsent: AnalyticsConsentChoice | null;
  analyticsConsentAt: Date | null;
  analyticsConsentSource: AnalyticsConsentSource | null;
};

export type SetAnalyticsConsentResult = {
  changed: boolean;
  from: AnalyticsConsentChoice | null;
  consent: StoredAnalyticsConsent;
};

export function createUsersRepo(db: DbExecutor) {
  return {
    /** `email` must already be normalised (trimmed, lowercased) — emails are stored that way. */
    async findByEmail(email: string): Promise<CurrentUser | null> {
      const [row] = await db
        .select(currentUserColumns)
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async findById(id: string): Promise<CurrentUser | null> {
      const [row] = await db
        .select(currentUserColumns)
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    /** Live users of an account — a deck's implicit owners (D33). */
    async listByAccount(accountId: string): Promise<CurrentUser[]> {
      return db
        .select(currentUserColumns)
        .from(users)
        .where(and(eq(users.accountId, accountId), isNull(users.deletedAt)))
        .orderBy(asc(users.createdAt), asc(users.id));
    },

    /** D259: the member's stored analytics choice (all null = not answered). */
    async findAnalyticsConsent(userId: string): Promise<StoredAnalyticsConsent | null> {
      const [row] = await db
        .select(consentColumns)
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    /** D297: whether the member gets reminder emails; null when the user is gone. */
    async findReminderEmails(userId: string): Promise<boolean | null> {
      const [row] = await db
        .select({ reminderEmails: users.reminderEmails })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);
      return row?.reminderEmails ?? null;
    },

    /** D297: stores the choice; returns the previous value (null when the user is gone). */
    async setReminderEmails(userId: string, value: boolean): Promise<boolean | null> {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({ reminderEmails: users.reminderEmails })
          .from(users)
          .where(and(eq(users.id, userId), isNull(users.deletedAt)))
          .for('update');
        if (!current) return null;
        if (current.reminderEmails !== value) {
          await tx.update(users).set({ reminderEmails: value }).where(eq(users.id, userId));
        }
        return current.reminderEmails;
      });
    },

    /**
     * D259: locks the user row, and when the value differs updates the three columns and inserts
     * the `analytics_consent_events` row in the same transaction. Same value → no write.
     */
    async setAnalyticsConsent(v: {
      userId: string;
      value: AnalyticsConsentChoice;
      source: AnalyticsConsentSource;
      requestId: string;
      at: Date;
    }): Promise<SetAnalyticsConsentResult | null> {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select(consentColumns)
          .from(users)
          .where(and(eq(users.id, v.userId), isNull(users.deletedAt)))
          .for('update');
        if (!current) return null;
        if (current.analyticsConsent === v.value) {
          return { changed: false, from: current.analyticsConsent, consent: current };
        }
        const [updated] = await tx
          .update(users)
          .set({
            analyticsConsent: v.value,
            analyticsConsentAt: v.at,
            analyticsConsentSource: v.source,
          })
          .where(eq(users.id, v.userId))
          .returning(consentColumns);
        await tx.insert(analyticsConsentEvents).values({
          userId: v.userId,
          fromValue: current.analyticsConsent,
          toValue: v.value,
          source: v.source,
          requestId: v.requestId,
          createdAt: v.at,
        });
        return { changed: true, from: current.analyticsConsent, consent: updated };
      });
    },

    /**
     * D25: account and user in one transaction; the account is named after the user. Only
     * `users.service.register` calls it (D241: `via` and `by` record why and by whom).
     */
    async createWithAccount(v: {
      email: string;
      displayName: string;
      via: RegistrationReason;
      by: string | null;
    }): Promise<CurrentUser> {
      return db.transaction(async (tx) => {
        const [account] = await tx
          .insert(accounts)
          .values({ name: v.displayName })
          .returning({ id: accounts.id });
        const [user] = await tx
          .insert(users)
          .values({
            accountId: account.id,
            email: v.email,
            displayName: v.displayName,
            registeredVia: v.via,
            registeredBy: v.by,
          })
          .returning(currentUserColumns);
        return user;
      });
    },
  };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
