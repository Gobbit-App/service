import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { accounts, analyticsConsentEvents, displayNameSql, users } from '@gobbit/db';
import type { DbExecutor } from '@gobbit/db';
import type { RegistrationReason } from '@gobbit/shared/auth';
import type { AnalyticsConsentChoice, AnalyticsConsentSource } from '@gobbit/shared/analytics';
import type { CurrentUser } from '../types';

const currentUserColumns = {
  id: users.id,
  accountId: users.accountId,
  email: users.email,
  displayName: displayNameSql(),
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

const profileColumns = {
  id: users.id,
  email: users.email,
  displayName: displayNameSql(),
  username: users.username,
  firstName: users.firstName,
  lastName: users.lastName,
  location: users.location,
  avatar: users.avatar,
};

/** `email` is selected ONLY so the caller can compute initials; never put it in a DTO. */
export type ProfileRow = {
  id: string;
  email: string;
  displayName: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  location: string | null;
  avatar: { publicId: string; width?: number; height?: number } | null;
};

export type ProfilePatch = Partial<
  Pick<ProfileRow, 'username' | 'firstName' | 'lastName' | 'location' | 'avatar'>
>;

export type UserSummaryRow = Pick<
  ProfileRow,
  'id' | 'firstName' | 'lastName' | 'username' | 'avatar' | 'email'
>;

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

    /** Worker-only: the smart-share setting plus the email for the admin check; never returned to clients. */
    async smartShareOf(id: string): Promise<{ email: string; smartShare: boolean } | null> {
      const [row] = await db
        .select({ email: users.email, smartShare: users.smartShare })
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async profileById(id: string): Promise<ProfileRow | null> {
      const [row] = await db
        .select(profileColumns)
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    /**
     * Explicit columns only. `email` is here ONLY for initials: callers must never return it.
     * Live users only (deleted ones are absent, like the other reads).
     */
    async summariesByIds(ids: string[]): Promise<UserSummaryRow[]> {
      if (ids.length === 0) return [];
      return db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
          avatar: users.avatar,
          email: users.email,
        })
        .from(users)
        .where(and(inArray(users.id, ids), isNull(users.deletedAt)));
    },

    /** `lowerUsername` must already be lower-cased; matching is case-insensitive. */
    async findByUsername(lowerUsername: string): Promise<ProfileRow | null> {
      const [row] = await db
        .select(profileColumns)
        .from(users)
        .where(and(sql`lower(${users.username}) = ${lowerUsername}`, isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    /** Runs on the caller's transaction handle so the service can add username holds and events. */
    async updateProfile(
      tx: DbExecutor,
      userId: string,
      patch: ProfilePatch,
    ): Promise<ProfileRow | null> {
      if (Object.keys(patch).length === 0) return this.profileById(userId);
      const [row] = await tx
        .update(users)
        .set(patch)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .returning(profileColumns);
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
