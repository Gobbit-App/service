import {
  decodeCursor,
  encodeCursor,
  type AdminWaitlistEntry,
  type AdminWaitlistInviteResult,
  type AdminWaitlistPage,
  type AdminWaitlistQuery,
} from '@pb/shared';
import type { Env } from '../env';
import type { Mailer } from '../mail/mailer';
import { waitlistInviteEmail } from '../mail/templates';
import type { PlatformAdmin } from '../access/platform-admin';
import {
  adminSortValue,
  type AdminListRow,
  type WaitlistRepo,
} from '../repositories/waitlist.repo';
import type { MagicLinksRepo } from '../repositories/magic-links.repo';
import type { UsersService } from './users.service';
import { generateToken, hashToken } from '../lib/tokens';
import { isUuid } from '../lib/resolve-deck';
import { decisionLogger, type DecisionLogger } from '../lib/decision-event';
import { conflict, notFound, WAITLIST_PROBLEMS, type HttpError } from '../errors/http-errors';
import {
  WAITLIST_ADMIN_DECISION_LEVELS,
  type WaitlistAdminDecisions,
  type WaitlistAdminRefusal,
} from './waitlist-admin.events';

const DAY_MS = 86_400_000;

export type WaitlistAdminEnv = Pick<Env, 'API_URL' | 'WAITLIST_INVITE_TTL_DAYS'>;

/** What one admin action needs, bound to one transaction (entry lock → change → audit row). */
export interface WaitlistAdminTxRepos {
  waitlist: Pick<
    WaitlistRepo,
    'lockById' | 'markInvited' | 'remove' | 'insertEvent' | 'findForAdmin'
  >;
  magicLinks: Pick<MagicLinksRepo, 'create'>;
  usersService: Pick<UsersService, 'register'>;
}

export type WaitlistAdminTransaction = <T>(
  fn: (repos: WaitlistAdminTxRepos) => Promise<T>,
) => Promise<T>;

export interface AdminCtx {
  requestId: string;
}

/** `first`: the entry went `confirmed` → `invited` (201); otherwise a resend (200). */
export type InviteResult = AdminWaitlistInviteResult & { first: boolean };

export function toAdminEntry(row: AdminListRow): AdminWaitlistEntry {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: row.id,
    email: row.email,
    kind: row.kind,
    note: row.note,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    confirmedAt: iso(row.confirmedAt),
    invitedAt: iso(row.invitedAt),
    removedAt: iso(row.removedAt),
    invitedBy:
      row.invitedBy && row.invitedByName !== null
        ? { id: row.invitedBy, displayName: row.invitedByName }
        : null,
  };
}

/**
 * 032: the platform admin's view of the waitlist. Every action locks the entry first, so two
 * admins (or two taps) act one after the other; the entry change, its `waitlist_events` row,
 * the account and the sign-in link commit together, and mail goes out only after the commit.
 */
export function createWaitlistAdminService(deps: {
  env: WaitlistAdminEnv;
  now: () => Date;
  mailer: Mailer;
  waitlist: Pick<WaitlistRepo, 'listForAdmin' | 'countsByStatus'>;
  transaction: WaitlistAdminTransaction;
  decisions?: DecisionLogger<WaitlistAdminDecisions>;
}) {
  const { env, now, mailer, waitlist, transaction } = deps;
  const decisions =
    deps.decisions ??
    decisionLogger<WaitlistAdminDecisions>('waitlist-admin', {
      levels: WAITLIST_ADMIN_DECISION_LEVELS,
    });

  /** Records the refusal, then hands back the error to throw. */
  function refuse(
    reason: WaitlistAdminRefusal,
    error: HttpError,
    r: { action: 'invite' | 'remove'; admin: PlatformAdmin; entryId: string; ctx: AdminCtx },
  ): HttpError {
    decisions.record('waitlist.admin', {
      outcome: 'refused',
      reason,
      action: r.action,
      actorId: r.admin.id,
      // A malformed id is path text the admin typed; only real ids reach the log.
      entryId: isUuid(r.entryId) ? r.entryId : undefined,
      requestId: r.ctx.requestId,
    });
    return error;
  }

  async function sendInvite(
    to: string,
    token: string,
    r: { entryId: string; ctx: AdminCtx },
  ): Promise<boolean> {
    const link = `${env.API_URL}/auth/callback?token=${encodeURIComponent(token)}`;
    try {
      await mailer.send({
        to,
        ...waitlistInviteEmail({ link, ttlDays: env.WAITLIST_INVITE_TTL_DAYS }),
      });
      decisions.record('waitlist.mail', {
        outcome: 'sent',
        template: 'invite',
        entryId: r.entryId,
        requestId: r.ctx.requestId,
      });
      return true;
    } catch (err) {
      decisions.record('waitlist.mail', {
        outcome: 'failed',
        template: 'invite',
        errorName: err instanceof Error ? err.name : 'unknown',
        entryId: r.entryId,
        requestId: r.ctx.requestId,
      });
      return false;
    }
  }

  return {
    async list(
      admin: PlatformAdmin,
      q: AdminWaitlistQuery,
      ctx: AdminCtx,
    ): Promise<AdminWaitlistPage> {
      const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
      const [rows, counts] = await Promise.all([
        waitlist.listForAdmin({ status: q.status, kind: q.kind, cursor, limit: q.limit + 1 }),
        waitlist.countsByStatus(q.kind),
      ]);
      const page = rows.slice(0, q.limit);
      const last = page.at(-1);
      decisions.record('waitlist.admin_list', {
        outcome: 'listed',
        actorId: admin.id,
        status: q.status,
        kind: q.kind,
        returned: page.length,
        page: cursor ? 'next' : 'first',
        requestId: ctx.requestId,
      });
      return {
        items: page.map(toAdminEntry),
        nextCursor:
          rows.length > q.limit && last
            ? encodeCursor({ createdAt: adminSortValue(last), id: last.id })
            : null,
        counts,
      };
    },

    /**
     * `confirmed` → `invited` with an account (`waitlist_invite`, linked when the address already
     * has one) and a `sign_in` link; `invited` → a fresh link (resend). No deck is made here: the
     * first sign-in makes the personal deck (Phase 3B).
     */
    async invite(admin: PlatformAdmin, id: string, ctx: AdminCtx): Promise<InviteResult> {
      const token = generateToken();
      const refusal = { action: 'invite' as const, admin, entryId: id, ctx };
      if (!isUuid(id)) throw refuse('not_found', notFound('Waitlist entry not found'), refusal);
      const result = await transaction(async (tx) => {
        const entry = await tx.waitlist.lockById(id);
        if (!entry) throw refuse('not_found', notFound('Waitlist entry not found'), refusal);
        if (entry.status === 'pending') {
          throw refuse(
            'pending',
            conflict('The address is not confirmed yet', WAITLIST_PROBLEMS.notConfirmed),
            refusal,
          );
        }
        if (entry.status === 'removed') {
          throw refuse(
            'removed',
            conflict('The entry was removed', WAITLIST_PROBLEMS.removed),
            refusal,
          );
        }

        const first = entry.status === 'confirmed';
        const { user, created } = await tx.usersService.register(entry.email, 'waitlist_invite', {
          requestId: ctx.requestId,
          actorId: admin.id,
        });
        if (first) {
          const invited = await tx.waitlist.markInvited({
            id,
            invitedBy: admin.id,
            userId: user.id,
            now: now(),
          });
          // The row is locked and was confirmed a moment ago; anything else is a bug.
          if (!invited) throw new Error(`waitlist entry ${id} changed under its lock`);
        }
        await tx.waitlist.insertEvent({
          entryId: id,
          action: first ? 'invited' : 'invite_resent',
          actorId: admin.id,
        });
        await tx.magicLinks.create({
          email: entry.email,
          tokenHash: hashToken(token),
          purpose: 'sign_in',
          expiresAt: new Date(now().getTime() + env.WAITLIST_INVITE_TTL_DAYS * DAY_MS),
        });
        const view = await tx.waitlist.findForAdmin(id);
        if (!view) throw new Error(`waitlist entry ${id} vanished under its lock`);
        return { view, first, created, userId: user.id };
      });

      const mailSent = await sendInvite(result.view.email, token, { entryId: id, ctx });
      decisions.record('waitlist.admin', {
        outcome: !result.first ? 'resent' : result.created ? 'invited' : 'linked_existing',
        action: 'invite',
        actorId: admin.id,
        entryId: id,
        userId: result.userId,
        mailSent,
        requestId: ctx.requestId,
      });
      return { entry: toAdminEntry(result.view), mailSent, first: result.first };
    },

    /** Pending or confirmed → `removed`; already removed is a no-op; invited is refused. */
    async remove(admin: PlatformAdmin, id: string, ctx: AdminCtx): Promise<void> {
      const refusal = { action: 'remove' as const, admin, entryId: id, ctx };
      if (!isUuid(id)) throw refuse('not_found', notFound('Waitlist entry not found'), refusal);
      const outcome = await transaction(async (tx) => {
        const entry = await tx.waitlist.lockById(id);
        if (!entry) throw refuse('not_found', notFound('Waitlist entry not found'), refusal);
        if (entry.status === 'invited') {
          throw refuse(
            'invited',
            conflict(
              'An invited entry has an account; it cannot be removed',
              WAITLIST_PROBLEMS.invited,
            ),
            refusal,
          );
        }
        if (entry.status === 'removed') return 'unchanged' as const;
        await tx.waitlist.remove({ id, removedBy: admin.id, now: now() });
        await tx.waitlist.insertEvent({ entryId: id, action: 'removed', actorId: admin.id });
        return 'removed' as const;
      });
      decisions.record('waitlist.admin', {
        outcome,
        action: 'remove',
        actorId: admin.id,
        entryId: id,
        requestId: ctx.requestId,
      });
    },
  };
}

export type WaitlistAdminService = ReturnType<typeof createWaitlistAdminService>;
