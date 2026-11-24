import { MEMBER_NAME } from '@gobbit/shared';
import type { InviteLink, InvitePreview } from '@gobbit/shared';
import type { DbTx, DeckInviteLinkRow, DeckRow } from '@gobbit/db';
import { resolveRole, authorize, type MembershipLookup } from '../access/authorize';
import { conflict, HttpError, notFound } from '../errors/http-errors';
import type { Env } from '../env';
import type { DecisionLogger } from '../lib/decision-event';
import { resolveDeck } from '../lib/resolve-deck';
import type { DecksRepo } from '../repositories/decks.repo';
import type { InviteLinksRepo } from '../repositories/invite-links.repo';
import type { UsersRepo } from '../repositories/users.repo';
import type { Actor, CurrentUser } from '../types';
import type { InviteLinkDecisions } from './invite-links.events';
import type { MemberSummaries } from './member-summaries';

export type InviteLinksEnv = Pick<Env, 'INVITE_TTL_DAYS' | 'INVITE_LINKS_WAITING_MAX'>;

type Gone = 'used' | 'revoked' | 'expired' | 'invalid';

const PROBLEM = {
  used: '/problems/invite-link-used',
  revoked: '/problems/invite-link-revoked',
  expired: '/problems/invite-link-expired',
  invalid: '/problems/invite-link-invalid',
} as const;

export function createInviteLinksService(deps: {
  env: InviteLinksEnv;
  now: () => Date;
  /** Public origin of the app, no trailing slash (as share.service). */
  origin: string;
  decks: DecksRepo;
  users: Pick<UsersRepo, 'findById'>;
  memberships: MembershipLookup;
  links: InviteLinksRepo;
  transaction: <T>(fn: (tx: DbTx) => Promise<T>) => Promise<T>;
  summaries: Pick<MemberSummaries, 'summaries'>;
  decisions: DecisionLogger<InviteLinkDecisions>;
}) {
  const { env, now, origin, decks, users, memberships, links, decisions } = deps;

  const urlOf = (token: string) => `${origin}/s/invite?t=${encodeURIComponent(token)}`;
  const shownName = (s?: { username: string | null; name: string | null }) =>
    s?.username || s?.name || MEMBER_NAME;

  /** Ended states from the row alone; null while unended. */
  function ended(link: DeckInviteLinkRow): Exclude<Gone, 'invalid'> | null {
    if (link.acceptedAt) return 'used';
    if (link.revokedAt) return 'revoked';
    return link.expiresAt <= now() ? 'expired' : null;
  }

  /** D473 for the read-only preview; accept re-checks inside its transaction. */
  async function stillValid(link: DeckInviteLinkRow): Promise<DeckRow | null> {
    const deck = await decks.findById(link.deckId);
    if (!deck || deck.deletedAt || deck.kind === 'personal' || !link.createdBy) return null;
    const creator = await users.findById(link.createdBy);
    if (!creator) return null;
    const m =
      deck.ownerAccountId === creator.accountId
        ? null
        : await memberships.findActive(deck.id, creator.id);
    return resolveRole(creator, deck, m) === 'owner' ? deck : null;
  }

  async function toDtos(
    rows: { link: DeckInviteLinkRow; invalid: boolean }[],
  ): Promise<InviteLink[]> {
    const people = await deps.summaries.summaries(
      rows.flatMap(({ link }) => [link.createdBy, link.acceptedBy].filter((x): x is string => !!x)),
    );
    return rows.map(({ link, invalid }) => {
      const end = ended(link);
      const state: InviteLink['state'] =
        end === 'used' ? 'accepted' : (end ?? (invalid ? 'invalid' : 'waiting'));
      return {
        id: link.id,
        name: link.name,
        role: link.role as InviteLink['role'],
        state,
        createdBy: (link.createdBy && people.get(link.createdBy)) || null,
        acceptedBy: (link.acceptedBy && people.get(link.acceptedBy)) || null,
        createdAt: link.createdAt.toISOString(),
        expiresAt: link.expiresAt.toISOString(),
        url: state === 'waiting' ? urlOf(link.token) : null,
      };
    });
  }

  return {
    async create(
      actor: Actor,
      idOrSlug: string,
      input: { name: string; role: 'maintainer' | 'editor' | 'reader' },
    ): Promise<InviteLink> {
      const { user, requestId } = actor;
      const deck = await resolveDeck(decks, idOrSlug, user);
      await authorize(user, deck, 'member.invite', memberships);
      const base = { deckId: deck.id, userId: user.id, requestId: requestId! };
      if (deck.kind === 'personal') {
        decisions.record('invite_link.create', { ...base, outcome: 'refused', reason: 'personal' });
        throw conflict("The personal deck can't be shared", '/problems/invite-link-personal');
      }
      const row = await links.create({
        deckId: deck.id,
        name: input.name,
        role: input.role,
        createdBy: user.id,
        ttlDays: env.INVITE_TTL_DAYS,
        max: env.INVITE_LINKS_WAITING_MAX,
        now: now(),
      });
      if (row === 'limit') {
        decisions.record('invite_link.create', { ...base, outcome: 'refused', reason: 'limit' });
        throw conflict(
          `This deck already has ${env.INVITE_LINKS_WAITING_MAX} waiting invite links; revoke one or wait for one to expire`,
          '/problems/invite-link-limit',
        );
      }
      decisions.record('invite_link.create', { ...base, outcome: 'created', linkId: row.id });
      const [dto] = await toDtos([{ link: row, invalid: false }]);
      return dto;
    },

    async list(user: CurrentUser, idOrSlug: string): Promise<InviteLink[]> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      await authorize(user, deck, 'member.invite', memberships);
      return toDtos(await links.listForDeck(deck.id, { ttlDays: env.INVITE_TTL_DAYS, now: now() }));
    },

    async revoke(actor: Actor, idOrSlug: string, linkId: string): Promise<void> {
      const { user, requestId } = actor;
      const deck = await resolveDeck(decks, idOrSlug, user);
      await authorize(user, deck, 'member.invite', memberships);
      const base = { deckId: deck.id, userId: user.id, linkId, requestId: requestId! };
      const row = await links.revoke(linkId, deck.id, user.id, now());
      if (row) {
        decisions.record('invite_link.revoke', { ...base, outcome: 'revoked' });
        return;
      }
      const existing = await links.findById(linkId);
      if (!existing || existing.deckId !== deck.id) throw notFound('Invite link not found');
      decisions.record('invite_link.revoke', {
        ...base,
        outcome: 'refused',
        reason: 'not_waiting',
      });
      throw conflict('That invite link is no longer waiting', '/problems/not-waiting');
    },

    /** 052 sign-in: the link behind a token, only while it still waits and its creator is still an owner. */
    async findWaiting(token: string): Promise<{ id: string } | null> {
      const link = await links.findByToken(token);
      return link && !ended(link) && (await stillValid(link)) ? { id: link.id } : null;
    },

    /** Anonymous: unknown and stopped links answer alike (D470); deck fields only while waiting. */
    async preview(
      token: string,
      surface: 'page' | 'preview',
      ctx: { requestId: string },
    ): Promise<InvitePreview> {
      const link = await links.findByToken(token);
      const deck = link && !ended(link) ? await stillValid(link) : null;
      const gone: Gone | null = !link ? 'invalid' : (ended(link) ?? (deck ? null : 'invalid'));
      const base = { surface, requestId: ctx.requestId, linkId: link?.id };
      if (gone || !link || !deck) {
        decisions.record('invite_link.open', {
          ...base,
          outcome: 'refused',
          reason: gone ?? 'invalid',
        });
        return { state: gone ?? 'invalid' };
      }
      const inviter = (await deps.summaries.summaries([link.createdBy!])).get(link.createdBy!);
      decisions.record('invite_link.open', { ...base, outcome: 'shown' });
      return {
        state: 'waiting',
        deckName: deck.name,
        inviterName: shownName(inviter),
        role: link.role as InviteLink['role'],
      };
    },

    /** The decision event of a join; the sign-in callback calls it after its transaction commits. */
    recordJoin(
      r: { result: string; link: { id: string; deckId: string } | null },
      ctx: { userId: string; requestId: string; via: 'join' | 'sign_in' },
    ): void {
      const base = { ...ctx, linkId: r.link?.id, deckId: r.link?.deckId };
      if (r.result === 'accepted') {
        decisions.record('invite_link.join', { ...base, outcome: 'accepted' });
      } else {
        decisions.record('invite_link.join', {
          ...base,
          outcome: 'refused',
          reason: r.result as 'used',
        });
      }
    },

    async accept(
      actor: Actor,
      token: string,
    ): Promise<{ deck: { id: string; slug: string; name: string } }> {
      const { user, requestId } = actor;
      const r = await deps.transaction((tx) =>
        links.accept(tx, { by: { token }, user, now: now() }),
      );
      this.recordJoin(r, { userId: user.id, requestId: requestId!, via: 'join' });
      if (r.result === 'accepted') {
        return { deck: r.deck };
      }
      if (r.result === 'already_member') {
        throw new HttpError(
          409,
          '/problems/invite-link-already-member',
          'Conflict',
          'You are already a member of this deck',
          undefined,
          { extensions: { deck: { slug: r.deck.slug } } },
        );
      }
      throw conflict(
        `This invite link is ${r.result === 'invalid' ? 'no longer valid' : r.result}`,
        PROBLEM[r.result],
      );
    },
  };
}

export type InviteLinksService = ReturnType<typeof createInviteLinksService>;
