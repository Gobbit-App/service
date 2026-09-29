import {
  RATE_CALLBACK_PER_IP,
  RATE_MAGIC_LINK_PER_EMAIL,
  RATE_MAGIC_LINK_PER_IP,
  SESSION_TOUCH_INTERVAL_MS,
  type SessionKind,
} from '@pb/shared';
import type { MagicLinkRow, SessionRow } from '@pb/db';
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
import { cookieSessionRequired } from '../errors/http-errors';
import { normalizeEmail, type UsersService } from './users.service';
import type { RateLimitService } from './rate-limit.service';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export type MagicLinkFailureReason = 'invalid' | 'used' | 'expired';

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

export function createAuthService(deps: {
  env: AuthEnv;
  now: () => Date;
  mailer: Mailer;
  sessions: SessionsRepo;
  magicLinks: MagicLinksRepo;
  memberships: MembershipsRepo;
  decks: DecksRepo;
  users: UsersRepo;
  usersService: UsersService;
  rateLimits: RateLimitService;
}) {
  const { env, now, mailer, sessions, magicLinks, memberships, decks, users, usersService } = deps;
  const sessionTtlMs = env.SESSION_TTL_DAYS * DAY_MS;

  async function openSession(
    userId: string,
    kind: SessionKind,
    userAgent: string | null,
  ): Promise<{ token: string; session: SessionRow }> {
    const token = generateToken();
    const at = now();
    const session = await sessions.create({
      userId,
      tokenHash: hashToken(token),
      kind,
      expiresAt: new Date(at.getTime() + sessionTtlMs),
      userAgent,
      now: at,
    });
    return { token, session };
  }

  /** The user a membership-bound invite signs in, or null when the invite no longer applies. */
  async function inviteUser(membershipId: string | null): Promise<CurrentUser | null> {
    if (!membershipId) return null;
    const membership = await memberships.findById(membershipId);
    if (!membership || membership.deletedAt) return null;
    const deck = await decks.findById(membership.deckId);
    if (!deck) return null;
    const user = await users.findById(membership.userId);
    if (!user) return null;
    await memberships.accept(membership.id, now());
    return user;
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
        const expiresAt = new Date(at.getTime() + sessionTtlMs);
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

    /** D22/D39: always succeeds for a well-formed address (no enumeration) unless rate limited. */
    async requestMagicLink(input: { email: string; ip: string }): Promise<void> {
      const email = normalizeEmail(input.email);
      await deps.rateLimits.enforce(
        rateKeys.magicLinkEmail(hashToken(email)),
        RATE_MAGIC_LINK_PER_EMAIL,
      );
      await deps.rateLimits.enforce(rateKeys.magicLinkIp(input.ip), RATE_MAGIC_LINK_PER_IP);

      const token = generateToken();
      await magicLinks.create({
        email,
        tokenHash: hashToken(token),
        purpose: 'sign_in',
        expiresAt: new Date(now().getTime() + env.MAGIC_LINK_TTL_MINUTES * MINUTE_MS),
        requestedIp: input.ip,
      });

      const link = `${env.API_URL}/auth/callback?token=${encodeURIComponent(token)}`;
      await mailer.send({
        to: email,
        ...signInEmail({ link, email, ttlMinutes: env.MAGIC_LINK_TTL_MINUTES }),
      });
    },

    /** D23/D26/D37: consumes the link once and opens a cookie session for its user. */
    async consumeMagicLink(input: {
      token: string;
      ip: string;
      userAgent: string | null;
    }): Promise<{ token: string; next: string | null; user: CurrentUser }> {
      await deps.rateLimits.enforce(rateKeys.callbackIp(input.ip), RATE_CALLBACK_PER_IP);

      const tokenHash = hashToken(input.token);
      const row = await magicLinks.consume(tokenHash, now());
      if (!row) {
        throw new MagicLinkFailure(
          classifyMagicLinkFailure(await magicLinks.findByTokenHash(tokenHash)),
        );
      }

      const user =
        row.purpose === 'invite'
          ? await inviteUser(row.membershipId)
          : (await usersService.findOrCreateByEmail(row.email)).user;
      if (!user) {
        throw new MagicLinkFailure('invalid');
      }

      const { token } = await openSession(user.id, 'cookie', input.userAgent);
      return { token, next: row.next, user };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
