import { and, eq, gt, isNull } from 'drizzle-orm';
import type { MagicLinkPurpose } from '@pb/shared';
import { magicLinks, type Db, type MagicLinkRow } from '@pb/db';

export interface NewMagicLink {
  email: string;
  tokenHash: string;
  purpose: MagicLinkPurpose;
  membershipId?: string | null;
  next?: string | null;
  expiresAt: Date;
  requestedIp?: string | null;
}

export function createMagicLinksRepo(db: Db) {
  return {
    async create(v: NewMagicLink): Promise<MagicLinkRow> {
      const [row] = await db
        .insert(magicLinks)
        .values({
          email: v.email,
          tokenHash: v.tokenHash,
          purpose: v.purpose,
          membershipId: v.membershipId ?? null,
          next: v.next ?? null,
          expiresAt: v.expiresAt,
          requestedIp: v.requestedIp ?? null,
        })
        .returning();
      return row;
    },

    /** D23: one atomic statement; null means invalid, used or expired. */
    async consume(tokenHash: string, now: Date): Promise<MagicLinkRow | null> {
      const [row] = await db
        .update(magicLinks)
        .set({ usedAt: now })
        .where(
          and(
            eq(magicLinks.tokenHash, tokenHash),
            isNull(magicLinks.usedAt),
            gt(magicLinks.expiresAt, now),
          ),
        )
        .returning();
      return row ?? null;
    },

    /**
     * D37 resend: every still-usable invite link of this membership stops working (it reads as
     * `expired`), so only the newest invite can be accepted.
     */
    async expireUnusedForMembership(membershipId: string, now: Date): Promise<void> {
      await db
        .update(magicLinks)
        .set({ expiresAt: now })
        .where(
          and(
            eq(magicLinks.membershipId, membershipId),
            isNull(magicLinks.usedAt),
            gt(magicLinks.expiresAt, now),
          ),
        );
    },

    /** Only used to classify why a consume failed. */
    async findByTokenHash(tokenHash: string): Promise<MagicLinkRow | null> {
      const [row] = await db
        .select()
        .from(magicLinks)
        .where(eq(magicLinks.tokenHash, tokenHash))
        .limit(1);
      return row ?? null;
    },
  };
}

export type MagicLinksRepo = ReturnType<typeof createMagicLinksRepo>;
