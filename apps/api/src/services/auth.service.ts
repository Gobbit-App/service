import {
  RATE_CALLBACK_PER_IP,
  RATE_MAGIC_LINK_PER_EMAIL,
  RATE_MAGIC_LINK_PER_IP,
  SESSION_TOUCH_INTERVAL_MS,
  type SessionKind,
} from '@gobbit/shared';
import type { RegistrationMode } from '@gobbit/shared/auth';
import type { MagicLinkRow, SessionRow } from '@gobbit/db';
import type { Env } from '../env';
import type { Mailer } from '../mail/mailer';
import { signInEmail } from '../mail/templates';
import type { SessionsRepo } from '../repositories/sessions.repo';
import type { MagicLinksRepo } from '../repositories/magic-links.repo';
import type { MembershipsRepo } from '../repositories/memberships.repo';
import type { DecksRepo } from '../repositories/decks.repo';
import type { UsersRepo } from '../repositories/users.repo';
import type { Authenticated, CredentialSource, CurrentUser } from '../types';
import { generateToken, hashesEqual, hashToken } from '../lib/tokens';
import { rateKeys } from '../lib/rate-window';
import { safeNextPath } from '../lib/next-path';
import { cookieSessionRequired, rateLimited } from '../errors/http-errors';
import { normalizeEmail, RegistrationClosed, type UsersService } from './users.service';
import type { RateLimitService } from './rate-limit.service';
import type { WaitlistService } from './waitlist.service';
import { lineSink } from '../lib/logger';
import type { LogHash } from '../lib/log-hash';
import { decisionLogger, type DecisionLogger } from '../lib/decision-event';
import {
  AUTH_DECISION_LEVELS,
  type AuthDecisions,
  type CallbackFailureReason,
} from './auth.events';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** D222: `closed` = a `sign_in` link for an email with no user while the mode is `waitlist`. */
export type MagicLinkFailureReason = CallbackFailureReason;

/** A magic link that can't be consumed; the route decides between redirect and problem (D26). */
export class MagicLinkFailure extends Error {
  constructor(public readonly reason: MagicLinkFailureReason) {
    super(`Magic link ${reason}`);
    this.name = 'MagicLinkFailure';
  }
}

/** Why `consume` returned nothing, from the row it couldn't update (D23). */
export function classifyMagicLinkFailure(
  row: Pick<MagicLinkRow, 'usedAt'> | null,
): MagicLinkFailureReason {
  if (!row) return 'invalid';
  return row.usedAt ? 'used' : 'expired';
}

export type AuthEnv = Pick<Env, 'API_URL' | 'MAGIC_LINK_TTL_MINUTES' | 'SESSION_TTL_DAYS'>;

/** The repositories a magic-link callback reads and writes, bound to one transaction (Phase 3B). */
export interface CallbackRepos {
  sessions: SessionsRepo;
  magicLinks: MagicLinksRepo;
  memberships: MembershipsRepo;
  decks: DecksRepo;
  users: UsersRepo;
  usersService: UsersService;
}

/** Runs `fn` with repos bound to one transaction; a throw from `fn` rolls every write back. */
export type CallbackTransaction = <T>(fn: (repos: CallbackRepos) => Promise<T>) => Promise<T>;

export function createAuthService(deps: {
  env: AuthEnv;
  now: () => Date;
  mailer: Mailer;
  sessions: SessionsRepo;
  magicLinks: MagicLinksRepo;
  transaction: CallbackTransaction;
  rateLimits: RateLimitService;
  /** D222: the request-time gate looks users up and lists unknown emails. */
  usersService: Pick<UsersService, 'findExisting'>;
  waitlist: Pick<WaitlistService, 'join'>;
  mode: RegistrationMode;
  logHash: LogHash;
  decisions?: DecisionLogger<AuthDecisions>;
  log?: (message: string, err?: unknown) => void;
}) {
  const { env, now, mailer, sessions, magicLinks, transaction, log = lineSink('auth') } = deps;
  const { logHash, mode } = deps;
  const decisions =
    deps.decisions ?? decisionLogger<AuthDecisions>('auth', { levels: AUTH_DECISION_LEVELS });
  const sessionTtlMs = env.SESSION_TTL_DAYS * DAY_MS;

  async function openSessionWith(
    sessionsRepo: SessionsRepo,
    userId: string,
    kind: SessionKind,
    userAgent: string | null,
  ): Promise<{ token: string; session: SessionRow }> {
    const token = generateToken();
    const at = now();
    const session = await sessionsRepo.create({
      userId,
      tokenHash: hashToken(token),
      kind,
      expiresAt: new Date(at.getTime() + sessionTtlMs),
      userAgent,
      now: at,
    });
    return { token, session };
  }

  const openSession = (userId: string, kind: SessionKind, userAgent: string | null) =>
    openSessionWith(sessions, userId, kind, userAgent);

  /** The user a membership-bound invite signs in, or null when the invite no longer applies. */
  async function inviteUser(
    r: CallbackRepos,
    membershipId: string | null,
  ): Promise<CurrentUser | null> {
    if (!membershipId) return null;
    const membership = await r.memberships.findById(membershipId);
    if (!membership || membership.deletedAt) return null;
    const deck = await r.decks.findById(membership.deckId);
    if (!deck) return null;
    const user = await r.users.findById(membership.userId);
    if (!user) return null;
    await r.memberships.accept(membership.id, now());
    return user;
  }

  /**
   * Phase 3B: the personal deck must exist before the session opens. A failure is logged and
   * fails the sign-in (the transaction rolls back, so the link stays usable for a retry).
   */
  async function ensureOnboarding(usersService: UsersService, user: CurrentUser): Promise<void> {
    try {
      await usersService.ensurePersonalDeck(user);
    } catch (err) {
      log('onboarding failed', err);
      throw new MagicLinkFailure('onboarding');
    }
  }

  /** D222: the user a `sign_in` link signs in; registering a new one may be `closed`. */
  async function signInUser(
    r: CallbackRepos,
    email: string,
    requestId: string,
  ): Promise<{ user: CurrentUser; created: boolean }> {
    const existing = await r.usersService.findExisting(email);
    if (existing) return { user: existing, created: false };
    try {
      return await r.usersService.register(email, 'open_sign_in', { requestId });
    } catch (err) {
      if (err instanceof RegistrationClosed) throw new MagicLinkFailure('closed');
      throw err;
    }
  }

  async function consume(input: {
    token: string;
    userAgent: string | null;
    requestId: string;
  }): Promise<{ token: string; next: string | null; user: CurrentUser; created: boolean }> {
    const tokenHash = hashToken(input.token);
    return transaction(async (r) => {
      const row = await r.magicLinks.consume(tokenHash, now());
      if (!row) {
        throw new MagicLinkFailure(
          classifyMagicLinkFailure(await r.magicLinks.findByTokenHash(tokenHash)),
        );
      }

      const { user, created } =
        row.purpose === 'invite'
          ? { user: await inviteUser(r, row.membershipId), created: false }
          : await signInUser(r, row.email, input.requestId);
      if (!user) {
        throw new MagicLinkFailure('invalid');
      }

      await ensureOnboarding(r.usersService, user);
      const { token } = await openSessionWith(r.sessions, user.id, 'cookie', input.userAgent);
      return { token, next: row.next, user, created };
    });
  }

  return {
    openSession,

    /** D29: bearer wins over cookie; D27: slides `expires_at` at most once per interval. */
    async authenticate(credentials: {
      bearer?: string;
      cookie?: string;
    }): Promise<Authenticated | null> {
      const via: CredentialSource | null = credentials.bearer
        ? 'bearer'
        : credentials.cookie
          ? 'cookie'
          : null;
      const token = via === 'bearer' ? credentials.bearer : credentials.cookie;
      if (!via || !token) return null;

      const tokenHash = hashToken(token);
      const at = now();
      const found = await sessions.findActiveByTokenHash(tokenHash, at);
      if (!found || !hashesEqual(found.session.tokenHash, tokenHash)) return null;

      let session = found.session;
      if (at.getTime() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
        // D27 slides the expiry forward but never shortens it: the seeded smoke session (D43)
        // starts with 365 days and must not collapse to SESSION_TTL_DAYS on first use.
        const expiresAt = new Date(
          Math.max(session.expiresAt.getTime(), at.getTime() + sessionTtlMs),
        );
        await sessions.touch(session.id, at, expiresAt);
        session = { ...session, lastSeenAt: at, expiresAt };
      }

      return { user: found.user, session, via };
    },

    async logout(session: SessionRow): Promise<void> {
      await sessions.revoke(session.id, now());
    },

    async logoutAll(userId: string): Promise<void> {
      await sessions.revokeAllForUser(userId, now());
    },

    /** D30: only a cookie session may mint a bearer, and the bearer is a new, separate row. */
    async exchangeForBearer(
      auth: Authenticated,
      userAgent: string | null,
    ): Promise<{ token: string; expiresAt: Date }> {
      if (auth.via !== 'cookie' || auth.session.kind !== 'cookie') {
        throw cookieSessionRequired();
      }
      const { token, session } = await openSession(auth.user.id, 'bearer', userAgent);
      return { token, expiresAt: session.expiresAt };
    },

    /**
     * D22/D39: always succeeds for a well-formed address (no enumeration) unless rate limited.
     * D222: in `waitlist` mode an email without a user gets the waitlist mail instead of a link;
     * the caller can't tell the two apart. Records `auth.magic_link`.
     */
    async requestMagicLink(input: {
      email: string;
      ip: string;
      next?: string;
      requestId: string;
    }): Promise<void> {
      const email = normalizeEmail(input.email);
      const subject = {
        requestId: input.requestId,
        emailHash: logHash('email', email),
        ipHash: logHash('ip', input.ip),
      };
      const limits = [
        ['per_email', rateKeys.magicLinkEmail(hashToken(email)), RATE_MAGIC_LINK_PER_EMAIL],
        ['per_ip', rateKeys.magicLinkIp(input.ip), RATE_MAGIC_LINK_PER_IP],
      ] as const;
      for (const [reason, key, limit] of limits) {
        const result = await deps.rateLimits.check(key, limit);
        if (!result.allowed) {
          decisions.record('auth.magic_link', { outcome: 'refused', reason, ...subject });
          throw rateLimited(result.retryAfterSeconds);
        }
      }

      const existing = await deps.usersService.findExisting(email);
      if (!existing && mode === 'waitlist') {
        // The magic-link limits above already bound this path (D222).
        await deps.waitlist.join({
          email,
          kind: 'other',
          source: 'sign_in',
          ip: input.ip,
          skipRateLimits: true,
          requestId: input.requestId,
        });
        decisions.record('auth.magic_link', { outcome: 'waitlisted', ...subject });
        return;
      }

      const token = generateToken();
      await magicLinks.create({
        email,
        tokenHash: hashToken(token),
        purpose: 'sign_in',
        expiresAt: new Date(now().getTime() + env.MAGIC_LINK_TTL_MINUTES * MINUTE_MS),
        requestedIp: input.ip,
        // An off-site or malformed next is dropped, never stored (the callback re-checks it).
        next: safeNextPath(input.next),
      });

      const link = `${env.API_URL}/auth/callback?token=${encodeURIComponent(token)}`;
      await mailer.send({
        to: email,
        ...signInEmail({ link, email, ttlMinutes: env.MAGIC_LINK_TTL_MINUTES }),
      });
      decisions.record('auth.magic_link', { outcome: 'sent', userId: existing?.id, ...subject });
    },

    /**
     * D23/D26/D37: consumes the link once and opens a cookie session for its user. Phase 3B:
     * consume, user resolution, personal-deck onboarding and session creation share one
     * transaction, so any failure leaves the link unconsumed and no session open. D222: a
     * `sign_in` link for an email without a user registers it only in `open` mode, else fails
     * as `closed`. Records `auth.callback`.
     */
    async consumeMagicLink(input: {
      token: string;
      ip: string;
      userAgent: string | null;
      requestId: string;
    }): Promise<{ token: string; next: string | null; user: CurrentUser }> {
      await deps.rateLimits.enforce(rateKeys.callbackIp(input.ip), RATE_CALLBACK_PER_IP);

      const subject = { requestId: input.requestId, ipHash: logHash('ip', input.ip) };
      try {
        const result = await consume(input);
        decisions.record('auth.callback', {
          outcome: 'signed_in',
          userId: result.user.id,
          created: result.created,
          ...subject,
        });
        return { token: result.token, next: result.next, user: result.user };
      } catch (err) {
        if (err instanceof MagicLinkFailure) {
          decisions.record('auth.callback', { outcome: 'failed', reason: err.reason, ...subject });
        }
        throw err;
      }
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
