import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpError } from '../errors/http-errors';
import { createMembershipsService } from './memberships.service';

const NOW = new Date('2026-01-10T12:00:00.000Z');
const UUID = '11111111-1111-4111-8111-111111111111';

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
      findOrCreateByEmail: vi.fn().mockResolvedValue({ user: invitee, created: true }),
    };
    mailer = { send: vi.fn().mockResolvedValue(undefined) };

    service = createMembershipsService({
      env: { API_URL: 'https://api.test', INVITE_TTL_DAYS: 7 },
      now: () => NOW,
      mailer,
      decks,
      memberships,
      magicLinks,
      users,
      usersService,
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

    it('rejects inviting yourself with 400', async () => {
      usersService.findOrCreateByEmail.mockResolvedValue({ user: caller, created: false });
      const err = await service.invite(caller, UUID, input).catch((e) => e);
      expect(err.status).toBe(400);
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('rejects users of the owner account with 400', async () => {
      usersService.findOrCreateByEmail.mockResolvedValue({
        user: { ...invitee, accountId: 'acc-owner' },
        created: false,
      });
      const err = await service.invite(caller, UUID, input).catch((e) => e);
      expect(err.status).toBe(400);
    });

    it('409s for an accepted member', async () => {
      memberships.findActive.mockResolvedValue(membershipRow({ acceptedAt: NOW }));
      const err = await service.invite(caller, UUID, input).catch((e) => e);
      expect(err.status).toBe(409);
      expect(err.type).toBe('/problems/already-member');
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('resends for a pending member: new role, older links expired, no new membership', async () => {
      memberships.findActive.mockResolvedValue(membershipRow());
      memberships.reinvite.mockResolvedValue(membershipRow({ role: 'editor' }));

      const result = await service.invite(caller, UUID, input);

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

      const result = await service.invite(caller, UUID, input);

      expect(result.created).toBe(true);
      expect(result.membership).toMatchObject({ id: 'm1', email: 'new@x.co', role: 'editor' });
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
