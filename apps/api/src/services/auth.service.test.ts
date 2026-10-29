import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RATE_MAGIC_LINK_PER_EMAIL,
  RATE_MAGIC_LINK_PER_IP,
  SESSION_TOUCH_INTERVAL_MS,
} from '@gobbit/shared';
import type { RegistrationMode } from '@gobbit/shared/auth';
import type { Authenticated } from '../types';
import { hashToken } from '../lib/tokens';
import { HttpError } from '../errors/http-errors';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from '../lib/decision-event';
import { createLogHash } from '../lib/log-hash';
import { AUTH_DECISION_LEVELS, type AuthDecisions } from './auth.events';
import { classifyMagicLinkFailure, createAuthService, MagicLinkFailure } from './auth.service';
import { RegistrationClosed } from './users.service';

const NOW = new Date('2026-01-10T12:00:00.000Z');
const user = { id: 'u1', accountId: 'a1', email: 'a@b.co', displayName: 'a' };

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    userId: 'u1',
    tokenHash: hashToken('tok'),
    kind: 'cookie',
    lastSeenAt: NOW,
    expiresAt: new Date(NOW.getTime() + 1000),
    ...overrides,
  } as any;
}

describe('classifyMagicLinkFailure', () => {
  it('is invalid when no row exists', () => {
    expect(classifyMagicLinkFailure(null)).toBe('invalid');
  });

  it('is used when the row was consumed', () => {
    expect(classifyMagicLinkFailure({ usedAt: new Date() })).toBe('used');
  });

  it('is expired when the row is unused', () => {
    expect(classifyMagicLinkFailure({ usedAt: null })).toBe('expired');
  });
});

describe('createAuthService', () => {
  let sessions: any;
  let magicLinks: any;
  let rateLimits: any;
  let mailer: any;
  let log: ReturnType<typeof vi.fn<(message: string, err?: unknown) => void>>;
  let usersService: any;
  let memberships: any;
  let decks: any;
  let users: any;
  let transaction: any;
  let waitlist: any;
  let capture: ReturnType<typeof captureLogger>;
  let service: ReturnType<typeof createAuthService>;

  const build = (mode: RegistrationMode) =>
    createAuthService({
      env: { API_URL: 'https://api.test', MAGIC_LINK_TTL_MINUTES: 15, SESSION_TTL_DAYS: 30 },
      now: () => NOW,
      mailer,
      sessions,
      magicLinks,
      transaction,
      rateLimits,
      usersService,
      waitlist,
      mode,
      logHash: createLogHash('k'.repeat(32)),
      decisions: decisionLogger<AuthDecisions>('auth', {
        parent: capture.logger,
        levels: AUTH_DECISION_LEVELS,
      }),
      log,
    });

  beforeEach(() => {
    sessions = {
      create: vi.fn(async (input) => ({ id: 'new', ...input })),
      findActiveByTokenHash: vi.fn(),
      touch: vi.fn(),
    };
    magicLinks = {
      create: vi.fn(),
      consume: vi.fn(),
      findByTokenHash: vi.fn(),
    };
    rateLimits = {
      enforce: vi.fn().mockResolvedValue(undefined),
      check: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 60 }),
    };
    mailer = { send: vi.fn().mockResolvedValue(undefined) };
    usersService = {
      findExisting: vi.fn().mockResolvedValue(user),
      register: vi.fn().mockResolvedValue({ user, created: false }),
      ensurePersonalDeck: vi.fn().mockResolvedValue(undefined),
    };
    memberships = {
      findById: vi.fn(),
      accept: vi.fn().mockResolvedValue(undefined),
    };
    decks = { findById: vi.fn().mockResolvedValue({ id: 'd1' }) };
    users = { findById: vi.fn().mockResolvedValue(user) };
    // Fake transaction: runs the callback against the same fakes (rollback is covered by the int test).
    const repos = { sessions, magicLinks, memberships, decks, users, usersService };
    transaction = vi.fn((fn) => fn(repos));

    waitlist = { join: vi.fn().mockResolvedValue('created') };
    capture = captureLogger();
    log = vi.fn();
    service = build('waitlist');
  });

  describe('authenticate', () => {
    it('returns null without credentials', async () => {
      await expect(service.authenticate({})).resolves.toBeNull();
      expect(sessions.findActiveByTokenHash).not.toHaveBeenCalled();
    });

    it('returns null for an unknown token', async () => {
      sessions.findActiveByTokenHash.mockResolvedValue(null);
      await expect(service.authenticate({ cookie: 'tok' })).resolves.toBeNull();
    });

    it('does not touch a session seen within the interval', async () => {
      const session = sessionRow({
        lastSeenAt: new Date(NOW.getTime() - SESSION_TOUCH_INTERVAL_MS),
      });
      sessions.findActiveByTokenHash.mockResolvedValue({ session, user });

      const result = await service.authenticate({ cookie: 'tok' });

      expect(sessions.touch).not.toHaveBeenCalled();
      expect(result).toMatchObject({ via: 'cookie', session });
    });

    it('touches and slides expiry after the interval', async () => {
      const session = sessionRow({
        lastSeenAt: new Date(NOW.getTime() - SESSION_TOUCH_INTERVAL_MS - 1),
      });
      sessions.findActiveByTokenHash.mockResolvedValue({ session, user });

      const result = await service.authenticate({ cookie: 'tok' });

      const expectedExpiry = new Date(NOW.getTime() + 30 * 86_400_000);
      expect(sessions.touch).toHaveBeenCalledWith('s1', NOW, expectedExpiry);
      expect(result?.session.lastSeenAt).toEqual(NOW);
      expect(result?.session.expiresAt).toEqual(expectedExpiry);
    });

    it('never shortens a longer expiry when sliding (seeded smoke session, D43)', async () => {
      const longExpiry = new Date(NOW.getTime() + 365 * 86_400_000);
      const session = sessionRow({
        lastSeenAt: new Date(NOW.getTime() - SESSION_TOUCH_INTERVAL_MS - 1),
        expiresAt: longExpiry,
      });
      sessions.findActiveByTokenHash.mockResolvedValue({ session, user });

      const result = await service.authenticate({ bearer: 'tok' });

      expect(sessions.touch).toHaveBeenCalledWith('s1', NOW, longExpiry);
      expect(result?.session.expiresAt).toEqual(longExpiry);
    });

    it('prefers the bearer over the cookie', async () => {
      sessions.findActiveByTokenHash.mockResolvedValue({ session: sessionRow(), user });
      const result = await service.authenticate({ bearer: 'tok', cookie: 'other' });
      expect(result?.via).toBe('bearer');
      expect(sessions.findActiveByTokenHash).toHaveBeenCalledWith(hashToken('tok'), NOW);
    });

    it('rejects a row whose hash does not match', async () => {
      sessions.findActiveByTokenHash.mockResolvedValue({
        session: sessionRow({ tokenHash: hashToken('different') }),
        user,
      });
      await expect(service.authenticate({ cookie: 'tok' })).resolves.toBeNull();
    });
  });

  describe('exchangeForBearer', () => {
    const auth = (via: string, kind: string) =>
      ({ user, via, session: sessionRow({ kind }) }) as unknown as Authenticated;

    it('mints a separate bearer session for a cookie session', async () => {
      const result = await service.exchangeForBearer(auth('cookie', 'cookie'), 'ua');
      expect(sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', kind: 'bearer', userAgent: 'ua' }),
      );
      expect(result.token).toEqual(expect.any(String));
      expect(result.expiresAt).toEqual(new Date(NOW.getTime() + 30 * 86_400_000));
    });

    it('refuses a request authenticated via bearer', async () => {
      const err = await service.exchangeForBearer(auth('bearer', 'cookie'), null).catch((e) => e);
      expect(err).toBeInstanceOf(HttpError);
      expect(err.type).toBe('/problems/cookie-session-required');
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('refuses a bearer-kind session even via cookie', async () => {
      const err = await service.exchangeForBearer(auth('cookie', 'bearer'), null).catch((e) => e);
      expect(err.status).toBe(403);
      expect(sessions.create).not.toHaveBeenCalled();
    });
  });

  describe('requestMagicLink', () => {
    it('checks the email limit before the IP limit', async () => {
      await service.requestMagicLink({ email: '  A@B.co ', ip: '1.2.3.4', requestId: 'r' });

      expect(rateLimits.check).toHaveBeenNthCalledWith(
        1,
        `magic-link:email:${hashToken('a@b.co')}`,
        RATE_MAGIC_LINK_PER_EMAIL,
      );
      expect(rateLimits.check).toHaveBeenNthCalledWith(
        2,
        'magic-link:ip:1.2.3.4',
        RATE_MAGIC_LINK_PER_IP,
      );
    });

    it('stores a hashed link and mails the callback URL', async () => {
      await service.requestMagicLink({ email: 'A@B.co', ip: '1.2.3.4', requestId: 'r' });

      const created = magicLinks.create.mock.calls[0][0];
      expect(created).toMatchObject({
        email: 'a@b.co',
        purpose: 'sign_in',
        requestedIp: '1.2.3.4',
      });
      expect(created.expiresAt).toEqual(new Date(NOW.getTime() + 15 * 60_000));

      const mail = mailer.send.mock.calls[0][0];
      expect(mail.to).toBe('a@b.co');
      const token = new URL(mail.text.match(/https:\/\/\S+/)[0]).searchParams.get('token')!;
      expect(hashToken(token)).toBe(created.tokenHash);
    });

    it('stores a safe next path with the link', async () => {
      await service.requestMagicLink({
        email: 'a@b.co',
        ip: 'ip',
        next: '/d/family',
        requestId: 'r',
      });
      expect(magicLinks.create.mock.calls[0][0].next).toBe('/d/family');
    });

    it.each(['//evil.com', 'https://evil.com', '/\\evil', '/'])(
      'drops an unsafe next %j',
      async (next) => {
        await service.requestMagicLink({ email: 'a@b.co', ip: 'ip', next, requestId: 'r' });
        expect(magicLinks.create.mock.calls[0][0].next).toBeUndefined();
      },
    );

    it('stops at the email limit without touching the IP limit or sending', async () => {
      rateLimits.check.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 });
      await expect(
        service.requestMagicLink({ email: 'a@b.co', ip: 'ip', requestId: 'r' }),
      ).rejects.toThrow();
      expect(rateLimits.check).toHaveBeenCalledTimes(1);
      expect(magicLinks.create).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });
  });

  describe('consumeMagicLink', () => {
    it('throws a classified failure when the link cannot be consumed', async () => {
      magicLinks.consume.mockResolvedValue(null);
      magicLinks.findByTokenHash.mockResolvedValue({ usedAt: new Date() });

      const err = await service
        .consumeMagicLink({ token: 't', ip: 'ip', userAgent: null, requestId: 'r' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(MagicLinkFailure);
      expect(err.reason).toBe('used');
    });

    it('opens a cookie session for a sign-in link', async () => {
      magicLinks.consume.mockResolvedValue({ purpose: 'sign_in', email: 'a@b.co', next: '/d/x' });

      const result = await service.consumeMagicLink({
        token: 't',
        ip: 'ip',
        userAgent: 'ua',
        requestId: 'r',
      });

      expect(result).toMatchObject({ next: '/d/x', user });
      expect(sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'cookie', userId: 'u1', userAgent: 'ua' }),
      );
    });

    it('runs consume, onboarding and session creation in one transaction', async () => {
      magicLinks.consume.mockResolvedValue({ purpose: 'sign_in', email: 'a@b.co', next: null });

      await service.consumeMagicLink({ token: 't', ip: 'ip', userAgent: null, requestId: 'r' });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(usersService.ensurePersonalDeck).toHaveBeenCalledWith(user);
    });

    it('fails with onboarding and opens no session when the personal deck cannot be ensured', async () => {
      magicLinks.consume.mockResolvedValue({ purpose: 'sign_in', email: 'a@b.co', next: null });
      usersService.ensurePersonalDeck.mockRejectedValue(new Error('db down'));

      const err = await service
        .consumeMagicLink({ token: 't', ip: 'ip', userAgent: null, requestId: 'r' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(MagicLinkFailure);
      expect(err.reason).toBe('onboarding');
      expect(sessions.create).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('onboarding failed', expect.any(Error));
    });

    it('ensures the personal deck before the session is created', async () => {
      magicLinks.consume.mockResolvedValue({ purpose: 'sign_in', email: 'a@b.co', next: null });

      await service.consumeMagicLink({ token: 't', ip: 'ip', userAgent: null, requestId: 'r' });

      const ensureOrder = usersService.ensurePersonalDeck.mock.invocationCallOrder[0];
      const sessionOrder = sessions.create.mock.invocationCallOrder[0];
      expect(ensureOrder).toBeLessThan(sessionOrder);
    });

    it('onboards the invitee, keeps next and accepts the invite', async () => {
      magicLinks.consume.mockResolvedValue({
        purpose: 'invite',
        email: 'a@b.co',
        membershipId: 'm1',
        next: '/d/x',
      });
      memberships.findById.mockResolvedValue({
        id: 'm1',
        deckId: 'd1',
        userId: 'u1',
        deletedAt: null,
      });

      const result = await service.consumeMagicLink({
        token: 't',
        ip: 'ip',
        userAgent: null,
        requestId: 'r',
      });

      expect(result).toMatchObject({ next: '/d/x', user });
      expect(usersService.ensurePersonalDeck).toHaveBeenCalledWith(user);
      expect(memberships.accept).toHaveBeenCalledWith('m1', NOW);
    });

    it('does not onboard when the link is unusable', async () => {
      magicLinks.consume.mockResolvedValue(null);
      magicLinks.findByTokenHash.mockResolvedValue(null);

      await expect(
        service.consumeMagicLink({ token: 't', ip: 'ip', userAgent: null, requestId: 'r' }),
      ).rejects.toMatchObject({ reason: 'invalid' });
      expect(usersService.ensurePersonalDeck).not.toHaveBeenCalled();
    });
  });
  describe('registration gate (D222, D241)', () => {
    const request = { email: 'New@Example.test', ip: '1.2.3.4', requestId: 'req-1' };

    it('records sent with the user id for an existing user', async () => {
      await service.requestMagicLink(request);
      await capture.flush();
      expect(expectDecision(capture.lines, 'auth.magic_link', { outcome: 'sent' })).toMatchObject({
        userId: 'u1',
        requestId: 'req-1',
        emailHash: expect.any(String),
        ipHash: expect.any(String),
      });
    });

    it('lists an unknown email in waitlist mode instead of sending a link', async () => {
      usersService.findExisting.mockResolvedValue(null);

      await expect(service.requestMagicLink(request)).resolves.toBeUndefined();

      expect(waitlist.join).toHaveBeenCalledWith({
        email: 'new@example.test',
        kind: 'other',
        source: 'sign_in',
        ip: '1.2.3.4',
        skipRateLimits: true,
        requestId: 'req-1',
      });
      expect(magicLinks.create).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
      await capture.flush();
      expectDecision(capture.lines, 'auth.magic_link', { outcome: 'waitlisted' });
      expect(JSON.stringify(capture.lines)).not.toContain('example.test');
      expect(JSON.stringify(capture.lines)).not.toContain('1.2.3.4');
    });

    it('propagates waitlist errors', async () => {
      usersService.findExisting.mockResolvedValue(null);
      waitlist.join.mockRejectedValue(new Error('db down'));
      await expect(service.requestMagicLink(request)).rejects.toThrow('db down');
    });

    it('sends a link to an unknown email in open mode', async () => {
      service = build('open');
      usersService.findExisting.mockResolvedValue(null);

      await service.requestMagicLink(request);

      expect(waitlist.join).not.toHaveBeenCalled();
      expect(magicLinks.create).toHaveBeenCalledTimes(1);
      await capture.flush();
      const line = expectDecision(capture.lines, 'auth.magic_link', { outcome: 'sent' });
      expect(line.userId).toBeUndefined();
    });

    it.each([
      ['per_email', 0],
      ['per_ip', 1],
    ] as const)('records refused %s and throws 429', async (reason, refusedCall) => {
      for (let i = 0; i < refusedCall; i++) {
        rateLimits.check.mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 60 });
      }
      rateLimits.check.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 });

      const err = await service.requestMagicLink(request).catch((e) => e);

      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(429);
      expect(usersService.findExisting).not.toHaveBeenCalled();
      await capture.flush();
      const line = expectDecision(capture.lines, 'auth.magic_link', { outcome: 'refused', reason });
      expect(line.level).toBe('warn');
    });

    it('fails a sign-in link for an email without a user as closed', async () => {
      magicLinks.consume.mockResolvedValue({ purpose: 'sign_in', email: 'n@example.test' });
      usersService.findExisting.mockResolvedValue(null);
      usersService.register.mockRejectedValue(new RegistrationClosed());

      const err = await service
        .consumeMagicLink({ token: 't', ip: 'ip', userAgent: null, requestId: 'req-1' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(MagicLinkFailure);
      expect(err.reason).toBe('closed');
      expect(usersService.register).toHaveBeenCalledWith('n@example.test', 'open_sign_in', {
        requestId: 'req-1',
      });
      expect(sessions.create).not.toHaveBeenCalled();
      await capture.flush();
      const line = expectDecision(capture.lines, 'auth.callback', {
        outcome: 'failed',
        reason: 'closed',
      });
      expect(line).toMatchObject({ level: 'warn', ipHash: expect.any(String) });
    });

    it('registers a new user through a sign-in link in open mode', async () => {
      service = build('open');
      const created = { ...user, id: 'u2' };
      magicLinks.consume.mockResolvedValue({ purpose: 'sign_in', email: 'n@example.test' });
      usersService.findExisting.mockResolvedValue(null);
      usersService.register.mockResolvedValue({ user: created, created: true });

      const result = await service.consumeMagicLink({
        token: 't',
        ip: 'ip',
        userAgent: null,
        requestId: 'req-1',
      });

      expect(result.user).toBe(created);
      await capture.flush();
      expect(
        expectDecision(capture.lines, 'auth.callback', { outcome: 'signed_in' }),
      ).toMatchObject({ userId: 'u2', created: true });
    });

    it('signs an existing user in without registering', async () => {
      magicLinks.consume.mockResolvedValue({ purpose: 'sign_in', email: 'a@b.co' });

      await service.consumeMagicLink({ token: 't', ip: 'ip', userAgent: null, requestId: 'r' });

      expect(usersService.register).not.toHaveBeenCalled();
      await capture.flush();
      expect(
        expectDecision(capture.lines, 'auth.callback', { outcome: 'signed_in' }),
      ).toMatchObject({ userId: 'u1', created: false });
    });

    it.each(['invalid', 'used', 'expired'] as const)(
      'records failed %s for an unusable link',
      async (reason) => {
        magicLinks.consume.mockResolvedValue(null);
        magicLinks.findByTokenHash.mockResolvedValue(
          reason === 'invalid' ? null : { usedAt: reason === 'used' ? NOW : null },
        );

        await service
          .consumeMagicLink({ token: 't', ip: 'ip', userAgent: null, requestId: 'r' })
          .catch(() => undefined);

        await capture.flush();
        expectDecision(capture.lines, 'auth.callback', { outcome: 'failed', reason });
      },
    );
  });
});
