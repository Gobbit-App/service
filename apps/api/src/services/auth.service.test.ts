import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RATE_MAGIC_LINK_PER_EMAIL,
  RATE_MAGIC_LINK_PER_IP,
  SESSION_TOUCH_INTERVAL_MS,
} from '@pb/shared';
import type { Authenticated } from '../types';
import { hashToken } from '../lib/tokens';
import { HttpError } from '../errors/http-errors';
import { classifyMagicLinkFailure, createAuthService, MagicLinkFailure } from './auth.service';

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
  let usersService: any;
  let service: ReturnType<typeof createAuthService>;

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
    rateLimits = { enforce: vi.fn().mockResolvedValue(undefined) };
    mailer = { send: vi.fn().mockResolvedValue(undefined) };
    usersService = { findOrCreateByEmail: vi.fn().mockResolvedValue({ user, created: false }) };

    service = createAuthService({
      env: { API_URL: 'https://api.test', MAGIC_LINK_TTL_MINUTES: 15, SESSION_TTL_DAYS: 30 },
      now: () => NOW,
      mailer,
      sessions,
      magicLinks,
      memberships: {} as any,
      decks: {} as any,
      users: {} as any,
      usersService,
      rateLimits,
    });
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
    it('enforces the email limit before the IP limit', async () => {
      await service.requestMagicLink({ email: '  A@B.co ', ip: '1.2.3.4' });

      expect(rateLimits.enforce).toHaveBeenNthCalledWith(
        1,
        `magic-link:email:${hashToken('a@b.co')}`,
        RATE_MAGIC_LINK_PER_EMAIL,
      );
      expect(rateLimits.enforce).toHaveBeenNthCalledWith(
        2,
        'magic-link:ip:1.2.3.4',
        RATE_MAGIC_LINK_PER_IP,
      );
    });

    it('stores a hashed link and mails the callback URL', async () => {
      await service.requestMagicLink({ email: 'A@B.co', ip: '1.2.3.4' });

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

    it('stops at the email limit without touching the IP limit or sending', async () => {
      rateLimits.enforce.mockRejectedValueOnce(new HttpError(429, 't', 'x'));
      await expect(service.requestMagicLink({ email: 'a@b.co', ip: 'ip' })).rejects.toThrow();
      expect(rateLimits.enforce).toHaveBeenCalledTimes(1);
      expect(magicLinks.create).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });
  });

  describe('consumeMagicLink', () => {
    it('throws a classified failure when the link cannot be consumed', async () => {
      magicLinks.consume.mockResolvedValue(null);
      magicLinks.findByTokenHash.mockResolvedValue({ usedAt: new Date() });

      const err = await service
        .consumeMagicLink({ token: 't', ip: 'ip', userAgent: null })
        .catch((e) => e);

      expect(err).toBeInstanceOf(MagicLinkFailure);
      expect(err.reason).toBe('used');
    });

    it('opens a cookie session for a sign-in link', async () => {
      magicLinks.consume.mockResolvedValue({ purpose: 'sign_in', email: 'a@b.co', next: '/d/x' });

      const result = await service.consumeMagicLink({ token: 't', ip: 'ip', userAgent: 'ua' });

      expect(result).toMatchObject({ next: '/d/x', user });
      expect(sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'cookie', userId: 'u1', userAgent: 'ua' }),
      );
    });
  });
});
