import { WAITLIST_CONFIRM_TTL_DAYS, type WaitlistKind, type WaitlistSource } from '@pb/shared';
import type { WaitlistEntryRow } from '@pb/db';
import type { Env } from '../env';
import type { Mailer } from '../mail/mailer';
import {
  waitlistConfirmEmail,
  waitlistExistingUserEmail,
  type RenderedMail,
} from '../mail/templates';
import type { WaitlistRepo } from '../repositories/waitlist.repo';
import type { UsersRepo } from '../repositories/users.repo';
import type { RateLimitService } from './rate-limit.service';
import { normalizeEmail } from './users.service';
import { generateToken, hashToken } from '../lib/tokens';
import { rateKeys } from '../lib/rate-window';
import type { LogHash } from '../lib/log-hash';
import { decisionLogger, type DecisionLogger } from '../lib/decision-event';
import { conflict, notFound, rateLimited } from '../errors/http-errors';
import {
  WAITLIST_DECISION_LEVELS,
  type WaitlistConfirmReason,
  type WaitlistDecisions,
  type WaitlistMailTemplate,
} from './waitlist.events';

const DAY_MS = 86_400_000;

export type WaitlistEnv = Pick<Env, 'API_URL' | 'APP_URL' | 'WAITLIST_JOIN_PER_EMAIL_PER_HOUR'>;

/** Runs `fn` with the waitlist repo bound to one transaction (entry change + audit row, D240). */
export type WaitlistTransaction = <T>(fn: (repo: WaitlistRepo) => Promise<T>) => Promise<T>;

export interface WaitlistJoinInput {
  email: string;
  kind: WaitlistKind;
  note?: string;
  utmSource?: string;
  source: WaitlistSource;
  ip: string;
  /** D219 honeypot: any non-empty value is a silent drop. */
  website?: string;
  /** 029's gate: `POST /auth/magic-link` has already applied its own limits. */
  skipRateLimits?: boolean;
  requestId: string;
}

/** How a join ended; the caller answers the same either way (D218), tests read it. */
export type WaitlistJoinResult =
  'created' | 'resent' | 'already_confirmed' | 'already_invited' | 'existing_user' | 'dropped';

/** Concurrent joins for one address: retry the lookup once after losing the insert race. */
const MAX_JOIN_ATTEMPTS = 2;

export function createWaitlistService(deps: {
  env: WaitlistEnv;
  now: () => Date;
  mailer: Mailer;
  waitlist: WaitlistRepo;
  transaction: WaitlistTransaction;
  users: Pick<UsersRepo, 'findByEmail'>;
  rateLimits: Pick<RateLimitService, 'check'>;
  logHash: LogHash;
  decisions?: DecisionLogger<WaitlistDecisions>;
}) {
  const { env, now, mailer, waitlist, transaction, users, rateLimits, logHash } = deps;
  const decisions =
    deps.decisions ??
    decisionLogger<WaitlistDecisions>('waitlist', { levels: WAITLIST_DECISION_LEVELS });
  const appBase = env.APP_URL ?? env.API_URL;

  function newToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = generateToken();
    return {
      token,
      tokenHash: hashToken(token),
      expiresAt: new Date(now().getTime() + WAITLIST_CONFIRM_TTL_DAYS * DAY_MS),
    };
  }

  /** D218: sent after the row commits; a failure is recorded and swallowed (the visitor retries). */
  async function sendMail(
    to: string,
    template: WaitlistMailTemplate,
    mail: RenderedMail,
    ctx: { requestId: string; entryId?: string },
  ): Promise<void> {
    try {
      await mailer.send({ to, ...mail });
      decisions.record('waitlist.mail', { outcome: 'sent', template, ...ctx });
    } catch (err) {
      decisions.record('waitlist.mail', {
        outcome: 'failed',
        template,
        errorName: err instanceof Error ? err.name : 'unknown',
        ...ctx,
      });
    }
  }

  function confirmMail(token: string, source: WaitlistSource): RenderedMail {
    const link = `${env.API_URL}/waitlist/confirm?token=${encodeURIComponent(token)}`;
    return waitlistConfirmEmail({ link, ttlDays: WAITLIST_CONFIRM_TTL_DAYS, source });
  }

  /** Pending → new token (and form fields from `landing`), with its `resent` audit row. */
  async function resend(
    entry: WaitlistEntryRow,
    input: WaitlistJoinInput,
    email: string,
  ): Promise<WaitlistEntryRow | null> {
    const { token, tokenHash, expiresAt } = newToken();
    const updated = await transaction(async (repo) => {
      const row = await repo.refreshPending(entry.id, {
        confirmTokenHash: tokenHash,
        confirmExpiresAt: expiresAt,
        fields:
          input.source === 'landing'
            ? {
                kind: input.kind,
                note: input.note ?? null,
                utmSource: input.utmSource ?? null,
              }
            : undefined,
      });
      if (row) await repo.insertEvent({ entryId: row.id, action: 'resent', source: input.source });
      return row;
    });
    if (updated) {
      await sendMail(email, 'confirm', confirmMail(token, input.source), {
        requestId: input.requestId,
        entryId: updated.id,
      });
    }
    return updated;
  }

  /** New pending entry with its `created` audit row; null when a concurrent join won. */
  async function create(input: WaitlistJoinInput, email: string): Promise<WaitlistEntryRow | null> {
    const { token, tokenHash, expiresAt } = newToken();
    const created = await transaction(async (repo) => {
      const row = await repo.insertPending({
        email,
        kind: input.kind,
        note: input.note ?? null,
        source: input.source,
        utmSource: input.utmSource ?? null,
        confirmTokenHash: tokenHash,
        confirmExpiresAt: expiresAt,
      });
      if (row) await repo.insertEvent({ entryId: row.id, action: 'created', source: input.source });
      return row;
    });
    if (created) {
      await sendMail(email, 'confirm', confirmMail(token, input.source), {
        requestId: input.requestId,
        entryId: created.id,
      });
    }
    return created;
  }

  async function classifyInvalid(tokenHash: string): Promise<WaitlistConfirmReason> {
    const row = await waitlist.findByTokenHash(tokenHash);
    if (!row) return 'unknown';
    return row.status === 'pending' ? 'expired' : 'used';
  }

  /** 404 when the entry doesn't exist, else 409 for a wrong state (032). */
  async function wrongState(repo: WaitlistRepo, id: string, detail: string): Promise<never> {
    const row = await repo.findById(id);
    throw row ? conflict(detail) : notFound('Waitlist entry not found');
  }

  return {
    /**
     * D218/D219: every well-formed request ends the same way for the caller. Throws only for a
     * per-email refusal (429) and infrastructure errors. Order matters: honeypot, then the
     * per-email counter (before any lookup), then the user, then the entry.
     */
    async join(input: WaitlistJoinInput): Promise<WaitlistJoinResult> {
      const email = normalizeEmail(input.email);
      const subject = {
        requestId: input.requestId,
        emailHash: logHash('email', email),
        source: input.source,
      };

      if (input.website?.trim()) {
        decisions.record('waitlist.join', {
          outcome: 'dropped',
          reason: 'honeypot',
          ipHash: logHash('ip', input.ip),
          ...subject,
        });
        return 'dropped';
      }

      if (!input.skipRateLimits) {
        const result = await rateLimits.check(
          rateKeys.waitlistEmail(hashToken(email)),
          env.WAITLIST_JOIN_PER_EMAIL_PER_HOUR,
        );
        if (!result.allowed) {
          decisions.record('waitlist.join', {
            outcome: 'refused',
            reason: 'per_email',
            retryAfterSec: result.retryAfterSeconds,
            ...subject,
          });
          throw rateLimited(result.retryAfterSeconds);
        }
      }

      if (await users.findByEmail(email)) {
        decisions.record('waitlist.join', {
          outcome: 'unchanged',
          reason: 'existing_user',
          kind: input.kind,
          ...subject,
        });
        await sendMail(
          email,
          'existing_user',
          waitlistExistingUserEmail({ signInUrl: `${appBase}/sign-in` }),
          { requestId: input.requestId },
        );
        return 'existing_user';
      }

      for (let attempt = 1; attempt <= MAX_JOIN_ATTEMPTS; attempt++) {
        const live = await waitlist.findLiveByEmail(email);
        if (live && live.status !== 'pending') {
          const reason = live.status === 'invited' ? 'already_invited' : 'already_confirmed';
          decisions.record('waitlist.join', {
            outcome: 'unchanged',
            reason,
            entryId: live.id,
            kind: input.kind,
            ...subject,
          });
          return reason;
        }
        const row = live ? await resend(live, input, email) : await create(input, email);
        if (row) {
          const outcome = live ? 'resent' : 'created';
          decisions.record('waitlist.join', {
            outcome,
            entryId: row.id,
            kind: row.kind,
            ...subject,
          });
          return outcome;
        }
      }
      // The entry changed under us twice in a row; nothing was written for this request.
      throw conflict('The waitlist entry changed during the request; try again');
    },

    /** D218: one atomic update; `invalid` reasons come from a second lookup (D240). */
    async confirm(
      token: string | undefined,
      ctx: { requestId: string },
    ): Promise<{ confirmed: boolean }> {
      if (!token) {
        decisions.record('waitlist.confirm', { outcome: 'invalid', reason: 'missing', ...ctx });
        return { confirmed: false };
      }
      const tokenHash = hashToken(token);
      const row = await transaction(async (repo) => {
        const confirmed = await repo.confirmByTokenHash(tokenHash, now());
        if (confirmed) {
          await repo.insertEvent({ entryId: confirmed.id, action: 'confirmed' });
        }
        return confirmed;
      });
      if (row) {
        decisions.record('waitlist.confirm', { outcome: 'confirmed', entryId: row.id, ...ctx });
        return { confirmed: true };
      }
      const reason = await classifyInvalid(tokenHash);
      decisions.record('waitlist.confirm', { outcome: 'invalid', reason, ...ctx });
      return { confirmed: false };
    },

    /** 032: `confirmed` → `invited`, with its audit row; pass `repo` to join a caller's transaction. */
    async markInvited(
      r: { id: string; invitedBy: string; userId: string },
      repo?: WaitlistRepo,
    ): Promise<WaitlistEntryRow> {
      const run = async (tx: WaitlistRepo) => {
        const row = await tx.markInvited({ ...r, now: now() });
        if (!row) return wrongState(tx, r.id, 'Only a confirmed entry can be invited');
        await tx.insertEvent({ entryId: row.id, action: 'invited', actorId: r.invitedBy });
        return row;
      };
      return repo ? run(repo) : transaction(run);
    },

    /** 032: any live status → `removed`, with its audit row. */
    async remove(
      r: { id: string; removedBy: string },
      repo?: WaitlistRepo,
    ): Promise<WaitlistEntryRow> {
      const run = async (tx: WaitlistRepo) => {
        const row = await tx.remove({ ...r, now: now() });
        if (!row) return wrongState(tx, r.id, 'The entry is already removed');
        await tx.insertEvent({ entryId: row.id, action: 'removed', actorId: r.removedBy });
        return row;
      };
      return repo ? run(repo) : transaction(run);
    },
  };
}

export type WaitlistService = ReturnType<typeof createWaitlistService>;
