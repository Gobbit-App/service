import { describe, expect, it, vi } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from '../lib/decision-event';
import type { Actor, CurrentUser } from '../types';
import type { InviteLinkDecisions } from './invite-links.events';
import { createInviteLinksService } from './invite-links.service';

const NOW = new Date('2026-06-01T00:00:00Z');
const TOKEN = 'tok-secret-123';
const user: CurrentUser = { id: 'u1', accountId: 'a1', email: 'a@b.co', displayName: 'A' };
const actor = { user, requestId: 'r1' } as Actor;
const deckRow = (o = {}) => ({
  id: 'd1',
  slug: 'family',
  name: 'Family',
  kind: 'shared',
  ownerAccountId: 'a1',
  deletedAt: null,
  ...o,
});
const linkRow = (o = {}) => ({
  id: 'l1',
  deckId: 'd1',
  name: 'Cousins',
  role: 'reader',
  token: TOKEN,
  createdBy: 'u1',
  acceptedBy: null,
  acceptedAt: null,
  revokedAt: null,
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 86_400_000),
  ...o,
});

function setup(o: { deck?: object; link?: object | null; creator?: object | null } = {}) {
  const capture = captureLogger();
  const deck = deckRow(o.deck);
  const decks = {
    findById: vi.fn().mockResolvedValue(deck),
    findBySlug: vi.fn().mockResolvedValue(deck),
    findDefaultForAccount: vi.fn(),
  };
  const links = {
    create: vi.fn().mockResolvedValue(linkRow()),
    revoke: vi.fn().mockResolvedValue(linkRow()),
    findById: vi.fn().mockResolvedValue(linkRow()),
    findByToken: vi.fn().mockResolvedValue(o.link === undefined ? linkRow() : o.link),
    accept: vi.fn(),
    listForDeck: vi.fn(),
  };
  const service = createInviteLinksService({
    env: { INVITE_TTL_DAYS: 7, INVITE_LINKS_WAITING_MAX: 20 },
    now: () => NOW,
    origin: 'https://x.test',
    decks,
    users: { findById: vi.fn().mockResolvedValue(o.creator === undefined ? user : o.creator) },
    memberships: { findActive: vi.fn().mockResolvedValue(null) },
    links,
    transaction: (fn: (tx: unknown) => unknown) => fn({}),
    summaries: {
      summaries: vi.fn().mockResolvedValue(new Map([['u1', { username: 'ann', name: 'Ann' }]])),
    },
    decisions: decisionLogger<InviteLinkDecisions>('invite-links', { parent: capture.logger }),
  } as never);
  return { ...capture, links, service };
}

const preview = (t: ReturnType<typeof setup>) =>
  t.service.preview(TOKEN, 'page', { requestId: 'r2' });

describe('invite-links.service create', () => {
  it('refuses a personal deck with an event', async () => {
    const t = setup({ deck: { kind: 'personal' } });
    await expect(
      t.service.create(actor, 'family', { name: 'x', role: 'reader' }),
    ).rejects.toMatchObject({
      status: 409,
      type: '/problems/invite-link-personal',
    });
    expect(t.links.create).not.toHaveBeenCalled();
    await t.flush();
    expectDecision(t.lines, 'invite_link.create', { outcome: 'refused', reason: 'personal' });
  });

  it('refuses at the cap with an event', async () => {
    const t = setup();
    t.links.create.mockResolvedValue('limit');
    await expect(
      t.service.create(actor, 'family', { name: 'x', role: 'reader' }),
    ).rejects.toMatchObject({
      status: 409,
      type: '/problems/invite-link-limit',
    });
    await t.flush();
    expectDecision(t.lines, 'invite_link.create', { outcome: 'refused', reason: 'limit' });
  });

  it('creates, returns the url and logs no token', async () => {
    const t = setup();
    const dto = await t.service.create(actor, 'family', { name: 'x', role: 'reader' });
    expect(dto).toMatchObject({ state: 'waiting', url: expect.stringContaining(TOKEN) });
    await t.flush();
    expectDecision(t.lines, 'invite_link.create', { outcome: 'created' });
    expect(JSON.stringify(t.lines)).not.toContain(TOKEN);
  });
});

describe('invite-links.service preview', () => {
  it('shows deck fields only while waiting', async () => {
    const t = setup();
    expect(await preview(t)).toEqual({
      state: 'waiting',
      deckName: 'Family',
      inviterName: 'ann',
      role: 'reader',
    });
    await t.flush();
    expectDecision(t.lines, 'invite_link.open', { outcome: 'shown' });
  });

  it.each([
    ['used', { acceptedAt: NOW }],
    ['revoked', { revokedAt: NOW }],
    ['expired', { expiresAt: NOW }],
  ] as const)('answers %s without deck fields', async (state, o) => {
    const t = setup({ link: linkRow(o) });
    expect(await preview(t)).toEqual({ state });
    await t.flush();
    expectDecision(t.lines, 'invite_link.open', { outcome: 'refused', reason: state });
    expect(JSON.stringify(t.lines)).not.toContain(TOKEN);
  });

  it.each([
    ['unknown token', { link: null }],
    ['deleted deck', { deck: { deletedAt: NOW } }],
    ['personal deck', { deck: { kind: 'personal' } }],
    ['creator gone', { creator: null }],
    ['creator no longer owner', { creator: { ...user, id: 'u9', accountId: 'a9' } }],
  ])('answers invalid for %s', async (_n, o) => {
    const t = setup(o);
    expect(await preview(t)).toEqual({ state: 'invalid' });
    await t.flush();
    expectDecision(t.lines, 'invite_link.open', { outcome: 'refused', reason: 'invalid' });
  });
});

describe('invite-links.service revoke', () => {
  it('refuses a link that is not waiting with a 409 and an event', async () => {
    const t = setup();
    t.links.revoke.mockResolvedValue(null);
    await expect(t.service.revoke(actor, 'family', 'l1')).rejects.toMatchObject({ status: 409 });
    await t.flush();
    expectDecision(t.lines, 'invite_link.revoke', { outcome: 'refused', reason: 'not_waiting' });
  });

  it('404s a link of another deck', async () => {
    const t = setup();
    t.links.revoke.mockResolvedValue(null);
    t.links.findById.mockResolvedValue(linkRow({ deckId: 'other' }));
    await expect(t.service.revoke(actor, 'family', 'l1')).rejects.toMatchObject({ status: 404 });
  });

  it('revokes a waiting link', async () => {
    const t = setup();
    await t.service.revoke(actor, 'family', 'l1');
    await t.flush();
    expectDecision(t.lines, 'invite_link.revoke', { outcome: 'revoked' });
  });
});

describe('invite-links.service recordJoin', () => {
  it('logs the sign-in join with via sign_in, accepted and refused', async () => {
    const t = setup();
    const ctx = { userId: 'u1', requestId: 'r1', via: 'sign_in' } as const;
    t.service.recordJoin({ result: 'accepted', link: linkRow() }, ctx);
    t.service.recordJoin({ result: 'revoked', link: linkRow() }, ctx);
    await t.flush();
    expectDecision(t.lines, 'invite_link.join', { outcome: 'accepted', via: 'sign_in' });
    expectDecision(t.lines, 'invite_link.join', {
      outcome: 'refused',
      reason: 'revoked',
      via: 'sign_in',
    });
  });
});

describe('invite-links.service accept', () => {
  const dk = { id: 'd1', slug: 'family', name: 'Family' };
  it('maps accepted to an event and the deck', async () => {
    const t = setup();
    t.links.accept.mockResolvedValue({ result: 'accepted', link: linkRow(), deck: dk });
    expect(await t.service.accept(actor, TOKEN)).toEqual({ deck: dk });
    await t.flush();
    expectDecision(t.lines, 'invite_link.join', { outcome: 'accepted' });
    expect(JSON.stringify(t.lines)).not.toContain(TOKEN);
  });

  it.each(['used', 'revoked', 'expired', 'invalid'] as const)(
    'maps %s to a 409 and event',
    async (r) => {
      const t = setup();
      t.links.accept.mockResolvedValue({ result: r, link: linkRow() });
      await expect(t.service.accept(actor, TOKEN)).rejects.toMatchObject({
        status: 409,
        type: `/problems/invite-link-${r}`,
      });
      await t.flush();
      expectDecision(t.lines, 'invite_link.join', { outcome: 'refused', reason: r });
    },
  );

  it('maps already_member to a 409 carrying the deck slug', async () => {
    const t = setup();
    t.links.accept.mockResolvedValue({ result: 'already_member', link: linkRow(), deck: dk });
    await expect(t.service.accept(actor, TOKEN)).rejects.toMatchObject({
      status: 409,
      type: '/problems/invite-link-already-member',
    });
    await t.flush();
    expectDecision(t.lines, 'invite_link.join', { outcome: 'refused', reason: 'already_member' });
  });
});
