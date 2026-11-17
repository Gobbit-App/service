import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpError } from '../errors/http-errors';
import { createMembershipsService } from './memberships.service';

const NOW = new Date('2026-01-10T12:00:00.000Z');
const UUID = '11111111-1111-4111-8111-111111111111';
const CTX = { requestId: 'req-1' };

const caller = { id: 'caller', accountId: 'acc-owner', email: 'o@x.co', displayName: 'Olga' };
const deck = { id: UUID, slug: 'family', name: 'Family Deck', ownerAccountId: 'acc-owner' };
const invitee = { id: 'inv', accountId: 'acc-inv', email: 'new@x.co', displayName: 'new' };

const membershipRow = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'm1',
    deckId: UUID,
    userId: 'inv',
    role: 'reader',
    invitedAt: NOW,
    acceptedAt: null,
    ...overrides,
  }) as any;

describe('createMembershipsService', () => {
  let decks: any;
  let memberships: any;
  let magicLinks: any;
  let users: any;
  let usersService: any;
  let mailer: any;
  let decisions: any;
  let rateLimits: any;
  let service: ReturnType<typeof createMembershipsService>;

  beforeEach(() => {
    decks = { findById: vi.fn().mockResolvedValue(deck), findBySlug: vi.fn() };
    memberships = {
      findActive: vi.fn().mockResolvedValue(null),
      listByDeck: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      reinvite: vi.fn(),
      softDelete: vi.fn(),
    };
    magicLinks = { create: vi.fn(), expireUnusedForMembership: vi.fn() };
    users = { listByAccount: vi.fn().mockResolvedValue([]), findById: vi.fn() };
    usersService = {
      register: vi.fn().mockResolvedValue({ user: invitee, created: true }),
    };
    mailer = { send: vi.fn().mockResolvedValue(undefined) };
    decisions = { record: vi.fn() };
    rateLimits = { check: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }) };

    service = createMembershipsService({
      env: { API_URL: 'https://api.test', INVITE_TTL_DAYS: 7 },
      now: () => NOW,
      mailer,
      decks,
      memberships,
      magicLinks,
      users,
      usersService,
      summaries: {
        summaries: async (ids: string[]) =>
          new Map(
            ids.map((id) => [
              id,
              {
                id,
                name: null,
                username: id === 'inv' ? 'newbie' : null,
                initials: id === 'inv' ? 'N' : 'O',
                photo: null,
              },
            ]),
          ),
      },
      logHash: (k: string, v: string) => `${k}:${v}`,
      decisions,
      rateLimits,
      lookupRatePerHour: 30,
    });
  });

  describe('list', () => {
    it('puts implicit owners first, then membership rows', async () => {
      users.listByAccount.mockResolvedValue([caller]);
      memberships.listByDeck.mockResolvedValue([
        { membership: membershipRow({ role: 'editor' }), user: invitee },
      ]);

      const result = await service.list(caller, UUID);

      expect(result.map((m) => [m.userId, m.role, m.implicit])).toEqual([
        ['caller', 'owner', true],
        ['inv', 'editor', false],
      ]);
      expect(result[0]).toMatchObject({ invitedAt: null, acceptedAt: null });
      expect(result[1].invitedAt).toBe(NOW.toISOString());
      expect(result[0]).toMatchObject({ username: null, initials: 'O', photo: null });
      expect(result[1]).toMatchObject({ username: 'newbie', initials: 'N', photo: null });
    });

    it('masks the email of a username holder except to themselves; others unchanged', async () => {
      users.listByAccount.mockResolvedValue([caller]);
      memberships.listByDeck.mockResolvedValue([
        { membership: membershipRow({ role: 'editor' }), user: invitee },
      ]);

      const other = await service.list(caller, UUID);
      expect(other.map((m) => m.email)).toEqual(['o@x.co', null]);

      // same id as the listed member (account owner passes authorize): sees their own address
      const self = await service.list({ ...caller, id: 'inv' }, UUID);
      expect(self[1].email).toBe('new@x.co');
    });
  });

  describe('remove', () => {
    it('rejects removing yourself with 400', async () => {
      const err = await service.remove(caller, UUID, 'caller').catch((e) => e);
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(400);
    });

    it('rejects removing a user of the owner account with 400', async () => {
      users.findById.mockResolvedValue({ ...invitee, accountId: 'acc-owner' });
      const err = await service.remove(caller, UUID, 'inv').catch((e) => e);
      expect(err.status).toBe(400);
      expect(memberships.softDelete).not.toHaveBeenCalled();
    });

    it('404s when there is no active membership', async () => {
      users.findById.mockResolvedValue(invitee);
      const err = await service.remove(caller, UUID, 'inv').catch((e) => e);
      expect(err.status).toBe(404);
    });

    it('soft-deletes an existing membership', async () => {
      users.findById.mockResolvedValue(invitee);
      memberships.findActive.mockResolvedValue(membershipRow());
      await service.remove(caller, UUID, 'inv');
      expect(memberships.softDelete).toHaveBeenCalledWith('m1', NOW);
    });
  });

  describe('invite', () => {
    const input = { email: 'new@x.co', role: 'editor' as const };

    it("409s inviting into the caller's personal deck (Phase 3B) before creating users", async () => {
      decks.findById.mockResolvedValue({ ...deck, isDefault: true, kind: 'personal' });
      const err = await service.invite(caller, UUID, input, CTX).catch((e) => e);
      expect(err).toBeInstanceOf(HttpError);
      expect(err).toMatchObject({ status: 409, type: '/problems/personal-deck' });
      expect(usersService.register).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('rejects inviting yourself with 400', async () => {
      usersService.register.mockResolvedValue({ user: caller, created: false });
      const err = await service.invite(caller, UUID, input, CTX).catch((e) => e);
      expect(err.status).toBe(400);
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('rejects users of the owner account with 400', async () => {
      usersService.register.mockResolvedValue({
        user: { ...invitee, accountId: 'acc-owner' },
        created: false,
      });
      const err = await service.invite(caller, UUID, input, CTX).catch((e) => e);
      expect(err.status).toBe(400);
    });

    it('invites by username: mail goes to the member, the DTO carries no new email field', async () => {
      users.findByUsername = vi.fn().mockResolvedValue({ ...invitee, username: 'newbie' });
      memberships.create.mockResolvedValue(membershipRow({ role: 'editor' }));

      const result = await service.invite(
        caller,
        UUID,
        { username: 'NewBie', role: 'editor' },
        CTX,
      );

      expect(users.findByUsername).toHaveBeenCalledWith('newbie');
      expect(usersService.register).toHaveBeenCalledWith('new@x.co', 'deck_invite', {
        requestId: 'req-1',
        actorId: 'caller',
      });
      expect(mailer.send.mock.calls[0][0].to).toBe('new@x.co');
      expect(result.membership.email).toBeNull();
      expect(Object.keys(result.membership).sort()).toEqual(
        [
          'acceptedAt',
          'deckId',
          'displayName',
          'email',
          'id',
          'invitedAt',
          'role',
          'userId',
        ].sort(),
      );
      expect(result.created).toBe(true);
    });

    it('404s an unknown username and records the miss with a hash only', async () => {
      users.findByUsername = vi.fn().mockResolvedValue(null);
      const err = await service
        .invite(caller, UUID, { username: 'ghost', role: 'reader' }, CTX)
        .catch((e) => e);
      expect(err).toMatchObject({ status: 404, detail: 'Member not found' });
      expect(decisions.record).toHaveBeenCalledWith('profile.lookup', {
        outcome: 'not_found',
        kind: 'username',
        queryHash: 'username:ghost',
        requestId: 'req-1',
        userId: 'caller',
      });
      expect(usersService.register).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('counts a username invite against the lookup budget; over it: 429, decision, no mail', async () => {
      users.findByUsername = vi.fn().mockResolvedValue({ ...invitee, username: 'newbie' });
      memberships.create.mockResolvedValue(membershipRow());
      await service.invite(caller, UUID, { username: 'newbie', role: 'reader' }, CTX);
      expect(rateLimits.check).toHaveBeenCalledWith('profile-lookup:user:caller', 30);

      rateLimits.check.mockResolvedValue({ allowed: false, retryAfterSeconds: 9 });
      mailer.send.mockClear();
      usersService.register.mockClear();
      const err = await service
        .invite(caller, UUID, { username: 'newbie', role: 'reader' }, CTX)
        .catch((e) => e);
      expect(err).toMatchObject({ status: 429 });
      expect(decisions.record).toHaveBeenCalledWith('profile.lookup', {
        outcome: 'refused',
        reason: 'rate_limited',
        kind: 'username',
        queryHash: 'username:newbie',
        requestId: 'req-1',
        userId: 'caller',
      });
      expect(usersService.register).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('never limits an invite by email', async () => {
      rateLimits.check.mockResolvedValue({ allowed: false, retryAfterSeconds: 9 });
      memberships.create.mockResolvedValue(membershipRow());
      await service.invite(caller, UUID, input, CTX);
      expect(rateLimits.check).not.toHaveBeenCalled();
      expect(mailer.send).toHaveBeenCalled();
    });

    it('409s for an accepted member', async () => {
      memberships.findActive.mockResolvedValue(membershipRow({ acceptedAt: NOW }));
      const err = await service.invite(caller, UUID, input, CTX).catch((e) => e);
      expect(err.status).toBe(409);
      expect(err.type).toBe('/problems/already-member');
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('resends for a pending member: new role, older links expired, no new membership', async () => {
      memberships.findActive.mockResolvedValue(membershipRow());
      memberships.reinvite.mockResolvedValue(membershipRow({ role: 'editor' }));

      const result = await service.invite(caller, UUID, input, CTX);

      expect(result.created).toBe(false);
      expect(result.membership.role).toBe('editor');
      expect(memberships.create).not.toHaveBeenCalled();
      expect(magicLinks.expireUnusedForMembership).toHaveBeenCalledWith('m1', NOW);
      expect(memberships.reinvite).toHaveBeenCalledWith('m1', {
        role: 'editor',
        invitedBy: 'caller',
        now: NOW,
      });
      expect(magicLinks.expireUnusedForMembership.mock.invocationCallOrder[0]).toBeLessThan(
        magicLinks.create.mock.invocationCallOrder[0],
      );
      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(magicLinks.create).toHaveBeenCalledTimes(1);
    });

    it('creates a membership and sends the invite for a new member', async () => {
      memberships.create.mockResolvedValue(membershipRow({ role: 'editor' }));

      const result = await service.invite(caller, UUID, input, CTX);

      expect(result.created).toBe(true);
      expect(result.membership).toMatchObject({ id: 'm1', email: 'new@x.co', role: 'editor' });
      // D241: invites always register, recorded as a deck invite by the inviter.
      expect(usersService.register).toHaveBeenCalledWith('new@x.co', 'deck_invite', {
        requestId: 'req-1',
        actorId: 'caller',
      });
      expect(memberships.create).toHaveBeenCalledWith({
        deckId: UUID,
        userId: 'inv',
        role: 'editor',
        invitedBy: 'caller',
        now: NOW,
      });
      expect(magicLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'invite',
          membershipId: 'm1',
          next: '/d/family',
          expiresAt: new Date(NOW.getTime() + 7 * 86_400_000),
        }),
      );

      const mail = mailer.send.mock.calls[0][0];
      expect(mail.to).toBe('new@x.co');
      expect(mail.text).toContain('Family Deck');
      expect(mail.text).toContain('https://api.test/auth/callback?token=');
    });
  });
});
