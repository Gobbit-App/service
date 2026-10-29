import type { InviteCreate, Member, MemberRole, Membership } from '@pb/shared';
import type { DeckRow, MembershipRow } from '@pb/db';
import type { Env } from '../env';
import type { Mailer } from '../mail/mailer';
import { inviteEmail } from '../mail/templates';
import type { DecksRepo } from '../repositories/decks.repo';
import type { MagicLinksRepo } from '../repositories/magic-links.repo';
import type { MembershipsRepo } from '../repositories/memberships.repo';
import type { UsersRepo } from '../repositories/users.repo';
import type { CurrentUser } from '../types';
import { authorize } from '../access/authorize';
import { resolveDeck } from '../lib/resolve-deck';
import { generateToken, hashToken } from '../lib/tokens';
import { badRequest, conflict, notFound, PERSONAL_DECK_PROBLEM } from '../errors/http-errors';
import type { UsersService } from './users.service';

const DAY_MS = 86_400_000;

/** D185: why a role change is refused (409). */
export const ROLE_CHANGE_PROBLEMS = {
  ownRole: '/problems/own-role',
  implicitOwner: '/problems/implicit-owner',
  invitePending: '/problems/invite-pending',
  lastOwner: '/problems/last-owner',
} as const;

type MemberUser = Pick<CurrentUser, 'id' | 'email' | 'displayName'>;

export function toMembershipDto(m: MembershipRow, user: MemberUser): Membership {
  return {
    id: m.id,
    deckId: m.deckId,
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    role: m.role,
    invitedAt: m.invitedAt.toISOString(),
    acceptedAt: m.acceptedAt?.toISOString() ?? null,
  };
}

export type MembershipsEnv = Pick<Env, 'API_URL' | 'INVITE_TTL_DAYS'>;

export function createMembershipsService(deps: {
  env: MembershipsEnv;
  now: () => Date;
  mailer: Mailer;
  decks: DecksRepo;
  memberships: MembershipsRepo;
  magicLinks: MagicLinksRepo;
  users: UsersRepo;
  usersService: UsersService;
}) {
  const { env, now, mailer, decks, memberships, magicLinks, users, usersService } = deps;

  /** D37: a fresh single-use link bound to the membership, landing on the deck. */
  async function sendInvite(
    inviter: CurrentUser,
    deck: DeckRow,
    membership: MembershipRow,
    invitee: MemberUser,
  ): Promise<void> {
    const token = generateToken();
    await magicLinks.create({
      email: invitee.email,
      tokenHash: hashToken(token),
      purpose: 'invite',
      membershipId: membership.id,
      next: `/d/${deck.slug}`,
      expiresAt: new Date(now().getTime() + env.INVITE_TTL_DAYS * DAY_MS),
    });

    const link = `${env.API_URL}/auth/callback?token=${encodeURIComponent(token)}`;
    await mailer.send({
      to: invitee.email,
      ...inviteEmail({
        link,
        deckName: deck.name,
        inviterName: inviter.displayName,
        role: membership.role,
        ttlDays: env.INVITE_TTL_DAYS,
      }),
    });
  }

  return {
    /** Implicit owners (the owner account's users) first, then membership rows. */
    async list(user: CurrentUser, idOrSlug: string): Promise<Member[]> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      await authorize(user, deck, 'member.list', memberships);

      const owners = await users.listByAccount(deck.ownerAccountId);
      const rows = await memberships.listByDeck(deck.id);

      return [
        ...owners.map((o) => ({
          userId: o.id,
          email: o.email,
          displayName: o.displayName,
          role: 'owner' as const,
          invitedAt: null,
          acceptedAt: null,
          implicit: true,
        })),
        ...rows.map(({ membership, user: u }) => ({
          userId: u.id,
          email: u.email,
          displayName: u.displayName,
          role: membership.role,
          invitedAt: membership.invitedAt.toISOString(),
          acceptedAt: membership.acceptedAt?.toISOString() ?? null,
          implicit: false,
        })),
      ];
    },

    /**
     * D185: an owner changes an accepted member's role. Never their own, an implicit owner's or a
     * pending invite's (re-invite instead); never the last owner when the account has no users.
     */
    async changeRole(
      user: CurrentUser,
      idOrSlug: string,
      userId: string,
      role: MemberRole,
    ): Promise<Member> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      await authorize(user, deck, 'member.invite', memberships);

      if (userId === user.id) {
        throw conflict('You cannot change your own role', ROLE_CHANGE_PROBLEMS.ownRole);
      }
      const target = await users.findById(userId);
      if (target?.accountId === deck.ownerAccountId) {
        throw conflict(
          'Owners of the deck account always stay owners',
          ROLE_CHANGE_PROBLEMS.implicitOwner,
        );
      }
      const membership = await memberships.findActive(deck.id, userId);
      if (!membership || !target) {
        throw notFound('Member not found');
      }
      if (!membership.acceptedAt) {
        throw conflict(
          'The invite is still pending; invite again with the new role',
          ROLE_CHANGE_PROBLEMS.invitePending,
        );
      }

      let updated = membership;
      if (membership.role !== role) {
        const demotesOwner = membership.role === 'owner';
        const guardLastOwner =
          demotesOwner && (await users.listByAccount(deck.ownerAccountId)).length === 0;
        const result = await memberships.updateRole(membership.id, deck.id, role, {
          guardLastOwner,
        });
        if (result === 'last-owner') {
          throw conflict('A deck needs at least one owner', ROLE_CHANGE_PROBLEMS.lastOwner);
        }
        updated = result;
      }
      return {
        userId: target.id,
        email: target.email,
        displayName: target.displayName,
        role: updated.role,
        invitedAt: updated.invitedAt.toISOString(),
        acceptedAt: updated.acceptedAt?.toISOString() ?? null,
        implicit: false,
      };
    },

    async remove(user: CurrentUser, idOrSlug: string, userId: string): Promise<void> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      await authorize(user, deck, 'member.remove', memberships);

      if (userId === user.id) {
        throw badRequest('You cannot remove yourself from a deck');
      }
      const target = await users.findById(userId);
      if (target?.accountId === deck.ownerAccountId) {
        throw badRequest('Owners of the deck account cannot be removed');
      }

      const membership = await memberships.findActive(deck.id, userId);
      if (!membership) {
        throw notFound('Member not found');
      }
      await memberships.softDelete(membership.id, now());
    },

    /**
     * D37: creates the user when needed (D241: `deck_invite`, registered by the inviter; the
     * gate never refuses an invite). Resending to a pending member replaces the earlier
     * invite: the new role applies and every older invite link stops working.
     */
    async invite(
      user: CurrentUser,
      idOrSlug: string,
      input: InviteCreate,
      ctx: { requestId: string },
    ): Promise<{ membership: Membership; created: boolean }> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      await authorize(user, deck, 'member.invite', memberships);
      // Phase 3B: the personal deck is never shared (D33: owner-only, no memberships).
      if (deck.isDefault) {
        throw conflict("The personal deck can't be shared", PERSONAL_DECK_PROBLEM);
      }

      const { user: invitee } = await usersService.register(input.email, 'deck_invite', {
        requestId: ctx.requestId,
        actorId: user.id,
      });
      if (invitee.id === user.id) {
        throw badRequest('You cannot invite yourself');
      }
      if (invitee.accountId === deck.ownerAccountId) {
        throw badRequest('Users of the deck owner account are already owners');
      }

      const existing = await memberships.findActive(deck.id, invitee.id);
      if (existing?.acceptedAt) {
        throw conflict('This user is already a member of the deck', '/problems/already-member');
      }

      let membership;
      if (existing) {
        await magicLinks.expireUnusedForMembership(existing.id, now());
        membership = await memberships.reinvite(existing.id, {
          role: input.role,
          invitedBy: user.id,
          now: now(),
        });
      } else {
        membership = await memberships.create({
          deckId: deck.id,
          userId: invitee.id,
          role: input.role,
          invitedBy: user.id,
          now: now(),
        });
      }

      await sendInvite(user, deck, membership, invitee);
      return { membership: toMembershipDto(membership, invitee), created: !existing };
    },
  };
}

export type MembershipsService = ReturnType<typeof createMembershipsService>;
