import type { Category, Deck, Item } from '@pb/shared';

const STAMP = '2026-01-01T00:00:00.000Z';

/** Builds an Item DTO for tests; payload defaults match the item type's empty shape. */
export function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    deckId: '00000000-0000-4000-8000-0000000000d1',
    type: 'text',
    status: 'published',
    title: 'A card',
    body: 'Some text',
    payload: {},
    sourceUrl: null,
    sourceKind: 'manual',
    verifiedAt: null,
    createdBy: '00000000-0000-4000-8000-0000000000a1',
    createdAt: STAMP,
    updatedAt: STAMP,
    categoryIds: [],
    isFavorite: false,
    ...overrides,
  } as Item;
}

/** Builds a Category DTO for tests. */
export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: '00000000-0000-4000-8000-0000000000c1',
    deckId: '00000000-0000-4000-8000-0000000000d1',
    slug: 'general',
    name: 'General',
    visibility: 'shared',
    isDefault: true,
    position: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  } as Category;
}

/** Builds a Deck DTO for tests. */
export function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: '00000000-0000-4000-8000-0000000000d1',
    kind: 'shared',
    slug: 'family',
    name: 'Family',
    isPublic: false,
    ownerAccountId: '00000000-0000-4000-8000-0000000000b1',
    createdAt: STAMP,
    updatedAt: STAMP,
    role: 'owner',
    ...overrides,
  } as Deck;
}
