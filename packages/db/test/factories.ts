import { randomBytes } from 'node:crypto';
import { v5 } from 'uuid';
import { and, eq } from 'drizzle-orm';
import {
  itemCreateSchema,
  type CategoryVisibility,
  type DeckKind,
  type MemberRole,
  type SessionKind,
  type ItemCreateInput,
  type ItemStatus,
} from '@pb/shared';
import type { Db } from '../src/client';
import {
  accounts,
  categories,
  decks,
  favorites,
  itemCategories,
  items,
  memberships,
  sessions,
  users,
  type CategoryRow,
  type DeckRow,
  type ItemRow,
  type MembershipRow,
  type SessionRow,
  type UserRow,
} from '../src/schema';
import { sha256Hex } from '../src/token-hash';

/** Namespace for deterministic test ids (never used by the production seed). */
export const FIXTURE_NAMESPACE = '0b8f3c52-7d1e-4f6a-9c2b-5e8d1a3f7b40';

export function fixtureId(key: string): string {
  return v5(key, FIXTURE_NAMESPACE);
}

function uniqueSuffix(): string {
  return randomBytes(4).toString('hex');
}

export interface CreateAccountUserOptions {
  id?: string;
  accountId?: string;
  email?: string;
  displayName?: string;
  accountName?: string;
}

/** Creates an account and its single user (Phase 2 keeps account ↔ user 1:1). */
export async function createAccountUser(
  db: Db,
  opts: CreateAccountUserOptions = {},
): Promise<UserRow> {
  const suffix = uniqueSuffix();
  const email = (opts.email ?? `user-${suffix}@example.test`).toLowerCase();
  const displayName = opts.displayName ?? email.split('@')[0];

  const [account] = await db
    .insert(accounts)
    .values({ id: opts.accountId, name: opts.accountName ?? displayName })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ id: opts.id, accountId: account.id, email, displayName })
    .returning();
  return user;
}

export interface CreateDeckOptions {
  id?: string;
  slug?: string;
  name?: string;
  kind?: DeckKind;
  isPublic?: boolean;
}

/** Creates a deck owned by the user's account; the DB trigger adds its `general` category. */
export async function createDeck(
  db: Db,
  owner: Pick<UserRow, 'accountId'>,
  opts: CreateDeckOptions = {},
): Promise<DeckRow> {
  const slug = opts.slug ?? `deck-${uniqueSuffix()}`;
  const [deck] = await db
    .insert(decks)
    .values({
      id: opts.id,
      slug,
      name: opts.name ?? slug,
      kind: opts.kind ?? 'shared',
      isPublic: opts.isPublic ?? false,
      ownerAccountId: owner.accountId,
    })
    .returning();
  return deck;
}

export async function defaultCategory(db: Db, deck: Pick<DeckRow, 'id'>): Promise<CategoryRow> {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.deckId, deck.id), eq(categories.isDefault, true)));
  if (!row) throw new Error(`Deck ${deck.id} has no default category`);
  return row;
}

export interface CreateCategoryOptions {
  id?: string;
  slug?: string;
  name?: string;
  visibility?: CategoryVisibility;
  position?: number;
}

export async function createCategory(
  db: Db,
  deck: Pick<DeckRow, 'id'>,
  opts: CreateCategoryOptions = {},
): Promise<CategoryRow> {
  const slug = opts.slug ?? `cat-${uniqueSuffix()}`;
  const [row] = await db
    .insert(categories)
    .values({
      id: opts.id,
      deckId: deck.id,
      slug,
      name: opts.name ?? slug,
      visibility: opts.visibility ?? 'shared',
      position: opts.position ?? 1,
    })
    .returning();
  return row;
}

export interface CreateItemOptions {
  id?: string;
  card?: ItemCreateInput;
  status?: ItemStatus;
  /** Defaults to the deck's default category. */
  categoryIds?: string[];
  createdBy?: string;
  createdAt?: Date;
  verifiedAt?: Date | null;
}

const DEFAULT_CARD: ItemCreateInput = { type: 'text', title: 'Test card', payload: {} };

/** Inserts an item (validated through `itemCreateSchema`) and its category links. */
export async function createItem(
  db: Db,
  deck: Pick<DeckRow, 'id'>,
  opts: CreateItemOptions = {},
): Promise<ItemRow> {
  const card = itemCreateSchema.parse(opts.card ?? DEFAULT_CARD);
  const categoryIds = opts.categoryIds ?? [(await defaultCategory(db, deck)).id];
  const sourceUrl = card.type === 'link' ? (card.payload as { url: string }).url : null;

  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(items)
      .values({
        id: opts.id,
        deckId: deck.id,
        type: card.type,
        status: opts.status ?? card.status ?? 'published',
        title: card.title,
        body: card.body ?? '',
        payload: card.payload as Record<string, unknown>,
        sourceUrl,
        sourceKind: sourceUrl ? 'link' : 'manual',
        verifiedAt: opts.verifiedAt === undefined ? new Date() : opts.verifiedAt,
        createdBy: opts.createdBy,
        createdAt: opts.createdAt,
      })
      .returning();
    if (categoryIds.length > 0) {
      await tx
        .insert(itemCategories)
        .values(
          categoryIds.map((categoryId) => ({ itemId: item.id, categoryId, deckId: deck.id })),
        );
    }
    return item;
  });
}

export async function addFavorite(
  db: Db,
  user: Pick<UserRow, 'id'>,
  item: Pick<ItemRow, 'id'>,
): Promise<void> {
  await db.insert(favorites).values({ userId: user.id, itemId: item.id }).onConflictDoNothing();
}

export interface AddMemberOptions {
  invitedBy?: string;
  /** `null` leaves the invite pending; defaults to accepted now. */
  acceptedAt?: Date | null;
}

/** Gives `user` a role on `deck` (the DB rejects users of the deck's owner account — D36). */
export async function addMember(
  db: Db,
  deck: Pick<DeckRow, 'id'>,
  user: Pick<UserRow, 'id'>,
  role: MemberRole,
  opts: AddMemberOptions = {},
): Promise<MembershipRow> {
  const [row] = await db
    .insert(memberships)
    .values({
      deckId: deck.id,
      userId: user.id,
      role,
      invitedBy: opts.invitedBy,
      acceptedAt: opts.acceptedAt === undefined ? new Date() : opts.acceptedAt,
    })
    .returning();
  return row;
}

export interface OpenSessionOptions {
  kind?: SessionKind;
  token?: string;
  expiresAt?: Date;
  userAgent?: string;
}

/** Inserts a live session for `user` and returns the raw token alongside the row. */
export async function openSession(
  db: Db,
  user: Pick<UserRow, 'id'>,
  opts: OpenSessionOptions = {},
): Promise<{ token: string; session: SessionRow }> {
  const token = opts.token ?? randomBytes(32).toString('base64url');
  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      tokenHash: sha256Hex(token),
      kind: opts.kind ?? 'bearer',
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 90 * 86_400_000),
      userAgent: opts.userAgent ?? 'test',
    })
    .returning();
  return { token, session };
}
