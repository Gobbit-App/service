import { can, MEMBER_NAME } from '@gobbit/shared';
import type { InviteCreate, Member, MemberRole, Membership } from '@gobbit/shared';
import type { DeckRow, MembershipRow } from '@gobbit/db';
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
import {
  badRequest,
  conflict,
  notFound,
  PERSONAL_DECK_PROBLEM,
  rateLimited,
} from '../errors/http-errors';
import { rateKeys } from '../lib/rate-window';
import type { RateLimitService } from './rate-limit.service';
import type { UsersService } from './users.service';
import type { DecisionLogger } from '../lib/decision-event';
import type { LogHash } from '../lib/log-hash';
import type { MemberSummaries } from './member-summaries';
import type { ProfileDecisions } from './profile.events';

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
  summaries: Pick<MemberSummaries, 'summaries'>;
  logHash: LogHash;
  decisions: DecisionLogger<ProfileDecisions>;
  rateLimits: Pick<RateLimitService, 'check'>;
  lookupRatePerHour: number;
}) {
  const { env, now, mailer, decks, memberships, magicLinks, users, usersService } = deps;

  /** Profile fields of a member list, from the shared summary builder (no email, initials via initialsFor). */
  async function profileOf(ids: string[]) {
    const map = await deps.summaries.summaries(ids);
    return (id: string) => {
      const s = map.get(id);
      return {
        email: null, // FR-004: a member list never carries an address, not even your own
        username: s?.username ?? null,
        initials: s?.initials ?? '',
        photo: s?.photo ?? null,
      };
    };
  }

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
      const viewerRole = await authorize(user, deck, 'member.list', memberships);

      const owners = await users.listByAccount(deck.ownerAccountId);
      const rows = await memberships.listByDeck(deck.id);

      const profile = await profileOf([...owners.map((o) => o.id), ...rows.map((r) => r.user.id)]);

      const shownNames = new Map<string, string>([
        ...owners.map((o) => [o.id, o.displayName] as const),
        ...rows
          .filter((r) => r.membership.acceptedAt)
          .map((r) => [r.user.id, r.user.displayName] as const),
      ]);

      return [
        ...owners.map((o) => ({
          userId: o.id,
          displayName: o.displayName,
          ...profile(o.id),
          role: 'owner' as const,
          invitedAt: null,
          invitedBy: null,
          acceptedAt: null,
          implicit: true,
        })),
        ...rows.map(({ membership, user: u }) => {
          // D462: a pending typed-address row is anonymous to everyone.
          const anon = !membership.acceptedAt && membership.invitedByEmail;
          const p = profile(u.id);
          return {
            userId: u.id,
            displayName: anon ? MEMBER_NAME : u.displayName,
            ...p,
            ...(anon ? { username: null, initials: '', photo: null } : {}),
            // D461: only the current inviter sees the address, while pending.
            email: anon && membership.invitedBy === user.id ? u.email : null,
            role: membership.role,
            invitedAt: membership.invitedAt.toISOString(),
            // D463: the inviter's shown name, for those who manage members.
            invitedBy:
              !membership.acceptedAt && can(viewerRole, 'member.invite')
                ? (shownNames.get(membership.invitedBy ?? '') ?? MEMBER_NAME)
                : null,
            acceptedAt: membership.acceptedAt?.toISOString() ?? null,
            implicit: false,
          };
        }),
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
      const profile = await profileOf([target.id]);
      return {
        userId: target.id,
        displayName: target.displayName,
        ...profile(target.id),
        role: updated.role,
        invitedAt: updated.invitedAt.toISOString(),
        invitedBy: null,
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

      let email: string;
      const byUsername = 'username' in input;
      if ('username' in input) {
        // Same budget as /members/lookup, so inviting cannot enumerate usernames past it.
        const gate = await deps.rateLimits.check(
          rateKeys.profileLookupUser(user.id),
          deps.lookupRatePerHour,
        );
        if (!gate.allowed) {
          deps.decisions.record('profile.lookup', {
            outcome: 'refused',
            reason: 'rate_limited',
            kind: 'username',
            queryHash: deps.logHash('username', input.username),
            requestId: ctx.requestId,
            userId: user.id,
          });
          throw rateLimited(gate.retryAfterSeconds);
        }
        // D425: the address stays inside; a miss is the same 404 whatever the reason.
        const found = await users.findByUsername(input.username.toLowerCase());
        if (!found) {
          deps.decisions.record('profile.lookup', {
            outcome: 'not_found',
            kind: 'username',
            queryHash: deps.logHash('username', input.username),
            requestId: ctx.requestId,
            userId: user.id,
          });
          throw notFound('Member not found');
        }
        email = found.email;
      } else {
        email = input.email;
      }
      const { user: invitee } = await usersService.register(email, 'deck_invite', {
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
          invitedByEmail: !byUsername,
          now: now(),
        });
      } else {
        membership = await memberships.create({
          deckId: deck.id,
          userId: invitee.id,
          role: input.role,
          invitedBy: user.id,
          invitedByEmail: !byUsername,
          now: now(),
        });
      }

      await sendInvite(user, deck, membership, invitee);
      // Spec 5.3/7.6: a username invite never echoes the address; D462: a typed one never the name.
      const dto = toMembershipDto(
        membership,
        byUsername ? invitee : { ...invitee, displayName: MEMBER_NAME },
      );
      return { membership: byUsername ? { ...dto, email: null } : dto, created: !existing };
    },
  };
}

export type MembershipsService = ReturnType<typeof createMembershipsService>;
