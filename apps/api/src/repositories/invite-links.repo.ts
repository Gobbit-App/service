import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { MemberRole } from '@gobbit/shared';
import {
  decks,
  deckInviteLinks,
  memberships,
  users,
  type DbExecutor,
  type DbTx,
  type DeckInviteLinkRow,
} from '@gobbit/db';
import { resolveRole } from '../access/authorize';
import { generateToken } from '../lib/tokens';
import { createMagicLinksRepo } from './magic-links.repo';
import { createMembershipsRepo } from './memberships.repo';

const DAY_MS = 86_400_000;

export type InviteGone = 'used' | 'revoked' | 'expired' | 'invalid';

export interface AcceptUser {
  id: string;
  accountId: string;
}

export type InviteAcceptResult =
  | {
      result: 'accepted';
      link: DeckInviteLinkRow;
      deck: { id: string; slug: string; name: string };
    }
  | {
      result: 'already_member';
      link: DeckInviteLinkRow;
      deck: { id: string; slug: string; name: string };
    }
  | { result: InviteGone; link: DeckInviteLinkRow | null };

const unended = (now: Date) =>
  and(
    isNull(deckInviteLinks.acceptedAt),
    isNull(deckInviteLinks.revokedAt),
    gt(deckInviteLinks.expiresAt, now),
  );

/** D473: the creator must still be the account owner or an accepted live owner member. */
const creatorIsOwner = sql`(${users.id} is not null and ${users.deletedAt} is null and (${users.accountId} = ${decks.ownerAccountId} or exists (
  select 1 from ${memberships} m where m.deck_id = ${deckInviteLinks.deckId} and m.user_id = ${deckInviteLinks.createdBy}
  and m.role = 'owner' and m.accepted_at is not null and m.deleted_at is null)))`;

export function createInviteLinksRepo(db: DbExecutor) {
  return {
    async findByToken(token: string): Promise<DeckInviteLinkRow | null> {
      const [row] = await db
        .select()
        .from(deckInviteLinks)
        .where(eq(deckInviteLinks.token, token))
        .limit(1);
      return row ?? null;
    },

    async findById(id: string): Promise<DeckInviteLinkRow | null> {
      const [row] = await db
        .select()
        .from(deckInviteLinks)
        .where(eq(deckInviteLinks.id, id))
        .limit(1);
      return row ?? null;
    },

    /** Locks the deck row so concurrent creates can't pass the cap together (FR-004). */
    async create(v: {
      deckId: string;
      name: string;
      role: MemberRole;
      createdBy: string;
      ttlDays: number;
      max: number;
      now: Date;
    }): Promise<DeckInviteLinkRow | 'limit'> {
      return db.transaction(async (tx) => {
        await tx
          .select({ id: decks.id })
          .from(decks)
          .where(eq(decks.id, v.deckId))
          .for('no key update');
        const [{ n }] = await tx
          .select({ n: count() })
          .from(deckInviteLinks)
          .where(and(eq(deckInviteLinks.deckId, v.deckId), unended(v.now)));
        if (n >= v.max) return 'limit';
        const [row] = await tx
          .insert(deckInviteLinks)
          .values({
            deckId: v.deckId,
            token: generateToken(),
            name: v.name,
            role: v.role,
            createdBy: v.createdBy,
            expiresAt: new Date(v.now.getTime() + v.ttlDays * DAY_MS),
          })
          .returning();
        return row;
      });
    },

    /** Waiting and `invalid` links, plus links that ended within `ttlDays`; newest first (D476). */
    async listForDeck(
      deckId: string,
      v: { ttlDays: number; now: Date },
    ): Promise<{ link: DeckInviteLinkRow; invalid: boolean }[]> {
      const cutoff = new Date(v.now.getTime() - v.ttlDays * DAY_MS);
      return db
        .select({
          link: deckInviteLinks,
          invalid: sql<boolean>`(${unended(v.now)}) and not ${creatorIsOwner}`,
        })
        .from(deckInviteLinks)
        .innerJoin(decks, eq(decks.id, deckInviteLinks.deckId))
        .leftJoin(users, eq(users.id, deckInviteLinks.createdBy))
        .where(
          and(
            eq(deckInviteLinks.deckId, deckId),
            sql`coalesce(${deckInviteLinks.acceptedAt}, ${deckInviteLinks.revokedAt}, ${deckInviteLinks.expiresAt}) > ${cutoff}`,
          ),
        )
        .orderBy(desc(deckInviteLinks.createdAt), desc(deckInviteLinks.id));
    },

    /** Waiting or `invalid` links only; null when there is none to revoke. */
    async revoke(
      id: string,
      deckId: string,
      by: string,
      now: Date,
    ): Promise<DeckInviteLinkRow | null> {
      const [row] = await db
        .update(deckInviteLinks)
        .set({ revokedAt: now, revokedBy: by, updatedAt: now })
        .where(and(eq(deckInviteLinks.id, id), eq(deckInviteLinks.deckId, deckId), unended(now)))
        .returning();
      return row ?? null;
    },

    /**
     * Accept transaction (data-model.md steps 1-6); `tx` is the caller's transaction. `user` may be
     * a function so the sign-in callback can register the person after the link checks pass.
     */
    async accept(
      tx: DbTx,
      v: {
        by: { token: string } | { id: string };
        user: AcceptUser | ((link: DeckInviteLinkRow) => Promise<AcceptUser>);
        now: Date;
      },
    ): Promise<InviteAcceptResult> {
      const [link] = await tx
        .select()
        .from(deckInviteLinks)
        .where(
          'token' in v.by ? eq(deckInviteLinks.token, v.by.token) : eq(deckInviteLinks.id, v.by.id),
        )
        .for('update');
      if (!link) return { result: 'invalid', link: null };
      if (link.acceptedAt) {
        // a retry or double click by the person who joined is not "used"
        const same = typeof v.user !== 'function' && link.acceptedBy === v.user.id;
        if (!same) return { result: 'used', link };
        const [d] = await tx
          .select({ id: decks.id, slug: decks.slug, name: decks.name })
          .from(decks)
          .where(eq(decks.id, link.deckId))
          .limit(1);
        return d ? { result: 'already_member', link, deck: d } : { result: 'used', link };
      }
      if (link.revokedAt) return { result: 'revoked', link };
      if (link.expiresAt <= v.now) return { result: 'expired', link };

      const [deck] = await tx
        .select({
          id: decks.id,
          slug: decks.slug,
          name: decks.name,
          kind: decks.kind,
          deletedAt: decks.deletedAt,
          ownerAccountId: decks.ownerAccountId,
        })
        .from(decks)
        .where(eq(decks.id, link.deckId))
        .limit(1);
      const memberRepo = createMembershipsRepo(tx);
      if (!deck || deck.deletedAt || deck.kind === 'personal' || !link.createdBy) {
        return { result: 'invalid', link };
      }
      const [creator] = await tx.select().from(users).where(eq(users.id, link.createdBy)).limit(1);
      const creatorRole =
        creator && !creator.deletedAt
          ? resolveRole(
              creator,
              deck,
              deck.ownerAccountId === creator.accountId
                ? null
                : await memberRepo.findActive(deck.id, creator.id),
            )
          : null;
      if (creatorRole !== 'owner') return { result: 'invalid', link };

      const user = typeof v.user === 'function' ? await v.user(link) : v.user;
      const existing =
        deck.ownerAccountId === user.accountId
          ? null
          : await memberRepo.findActive(deck.id, user.id);
      const info = { id: deck.id, slug: deck.slug, name: deck.name };
      if (resolveRole(user, deck, existing)) return { result: 'already_member', link, deck: info };

      if (existing) {
        await tx
          .update(memberships)
          .set({ role: link.role, acceptedAt: v.now })
          .where(eq(memberships.id, existing.id));
        await createMagicLinksRepo(tx).expireUnusedForMembership(existing.id, v.now);
      } else {
        // savepoint: losing the race on the unique index must not abort the caller's transaction
        try {
          await tx.transaction((sp) =>
            sp.insert(memberships).values({
              deckId: deck.id,
              userId: user.id,
              role: link.role,
              invitedBy: link.createdBy,
              invitedAt: v.now,
              acceptedAt: v.now,
            }),
          );
        } catch (e) {
          const code = e as { code?: string; cause?: { code?: string } };
          if ((code.code ?? code.cause?.code) === '23505') {
            return { result: 'already_member', link, deck: info };
          }
          throw e;
        }
      }
      const [done] = await tx
        .update(deckInviteLinks)
        .set({ acceptedAt: v.now, acceptedBy: user.id, updatedAt: v.now })
        .where(eq(deckInviteLinks.id, link.id))
        .returning();
      return { result: 'accepted', link: done, deck: info };
    },
  };
}

export type InviteLinksRepo = ReturnType<typeof createInviteLinksRepo>;
