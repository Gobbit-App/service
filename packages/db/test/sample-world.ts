import type { Db } from '../src/client';
import type { CategoryRow, DeckRow, ItemRow, UserRow } from '../src/schema';
import {
  addFavorite,
  createAccountUser,
  createCategory,
  createDeck,
  createItem,
  fixtureId,
} from './factories';
import { SAMPLE_CATEGORIES, sampleCards, type SampleCategorySlug } from './fixtures/sample-cards';

export const OWNER_EMAIL = 'owner@example.test';
export const OTHER_EMAIL = 'other@example.test';

const SAMPLE_BASE_TIME = Date.UTC(2026, 0, 1);
const SAMPLE_VERIFIED_AT = new Date(SAMPLE_BASE_TIME);

export interface SampleWorld {
  owner: UserRow;
  other: UserRow;
  decks: { personal: DeckRow; family: DeckRow; scratch: DeckRow; otherPersonal: DeckRow };
  categories: Record<SampleCategorySlug, CategoryRow>;
  /** Items keyed by sample-card key; `fixtureId(key) === item.id`. */
  cards: Record<string, ItemRow>;
}

/** Tags the 25 sample cards into `deck`, one hour apart, newest first (read-only test data). */
export async function loadSampleCards(
  db: Db,
  deck: DeckRow,
  categoriesBySlug: Record<SampleCategorySlug, CategoryRow>,
  author: UserRow,
): Promise<Record<string, ItemRow>> {
  const cards: Record<string, ItemRow> = {};
  for (const [i, sc] of sampleCards.entries()) {
    const item = await createItem(db, deck, {
      id: fixtureId(sc.key),
      card: sc.card,
      status: sc.status,
      categoryIds: sc.categories.map((slug) => categoriesBySlug[slug].id),
      createdBy: author.id,
      createdAt: new Date(SAMPLE_BASE_TIME - i * 3_600_000),
      verifiedAt: SAMPLE_VERIFIED_AT,
    });
    if (sc.favorite) await addFavorite(db, author, item);
    cards[sc.key] = item;
  }
  return cards;
}

/**
 * The Phase 1 fixture layout built with factories: an owner with `personal`, `family`
 * (six categories + 25 sample cards, one favorite) and `scratch`; another user owning
 * `other-personal`.
 */
export async function createSampleWorld(db: Db): Promise<SampleWorld> {
  const owner = await createAccountUser(db, {
    id: fixtureId('user/owner'),
    accountId: fixtureId('account/owner'),
    email: OWNER_EMAIL,
    displayName: 'Owner',
  });
  const other = await createAccountUser(db, {
    id: fixtureId('user/other'),
    accountId: fixtureId('account/other'),
    email: OTHER_EMAIL,
    displayName: 'Other',
  });

  const personal = await createDeck(db, owner, {
    id: fixtureId('deck/personal'),
    slug: 'personal',
    name: 'My Deck',
    kind: 'personal',
  });
  const family = await createDeck(db, owner, {
    id: fixtureId('deck/family'),
    slug: 'family',
    name: 'Family',
  });
  const scratch = await createDeck(db, owner, {
    id: fixtureId('deck/scratch'),
    slug: 'scratch',
    name: 'Scratch',
  });
  const otherPersonal = await createDeck(db, other, {
    id: fixtureId('deck/other-personal'),
    slug: 'other-personal',
    name: 'Other Deck',
    kind: 'personal',
  });

  const categories = {} as Record<SampleCategorySlug, CategoryRow>;
  for (const cat of SAMPLE_CATEGORIES) {
    categories[cat.slug] = await createCategory(db, family, {
      id: fixtureId(`family/${cat.slug}`),
      slug: cat.slug,
      name: cat.name,
      position: cat.position,
    });
  }

  const cards = await loadSampleCards(db, family, categories, owner);

  return { owner, other, decks: { personal, family, scratch, otherPersonal }, categories, cards };
}
