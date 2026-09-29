import { v5 } from 'uuid';

export const SEED_NAMESPACE = '6f1c2b1e-4a53-4b8e-9d5e-2a7c9f0e1b3d';

export function seedId(key: string): string {
  return v5(key, SEED_NAMESPACE);
}

export const DEFAULT_DEV_EMAIL = 'dev@example.test';
export const OTHER_EMAIL = 'other@example.test';

export const FAMILY_CATEGORIES = [
  { slug: 'school', name: 'School', position: 1 },
  { slug: 'health', name: 'Health', position: 2 },
  { slug: 'food', name: 'Food', position: 3 },
  { slug: 'admin', name: 'Admin', position: 4 },
  { slug: 'home', name: 'Home', position: 5 },
  { slug: 'fun', name: 'Fun', position: 6 },
] as const;

export function buildSeedData(devEmail: string) {
  const devAccountId = seedId('account/dev');
  const otherAccountId = seedId('account/other');
  const familyDeckId = seedId('deck/family');

  return {
    accounts: [
      {
        id: devAccountId,
        name: 'Dev Household',
      },
      {
        id: otherAccountId,
        name: 'Other Household',
      },
    ],
    users: [
      {
        id: seedId('user/dev'),
        accountId: devAccountId,
        email: devEmail.toLowerCase(),
        displayName: 'Dev User',
      },
      {
        id: seedId('user/other'),
        accountId: otherAccountId,
        email: OTHER_EMAIL,
        displayName: 'Other User',
      },
    ],
    decks: [
      {
        id: seedId('deck/dev-personal'),
        kind: 'personal' as const,
        slug: 'dev-personal',
        name: 'My Deck',
        ownerAccountId: devAccountId,
        isPublic: false,
      },
      {
        id: familyDeckId,
        kind: 'shared' as const,
        slug: 'family',
        name: 'Family',
        ownerAccountId: devAccountId,
        isPublic: false,
      },
      {
        id: seedId('deck/smoke'),
        kind: 'shared' as const,
        slug: 'smoke',
        name: 'Smoke Tests',
        ownerAccountId: devAccountId,
        isPublic: false,
      },
      {
        id: seedId('deck/other-personal'),
        kind: 'personal' as const,
        slug: 'other-personal',
        name: 'Other Deck',
        ownerAccountId: otherAccountId,
        isPublic: false,
      },
    ],
    categories: FAMILY_CATEGORIES.map((cat) => ({
      id: seedId(`family/${cat.slug}`),
      deckId: familyDeckId,
      slug: cat.slug,
      name: cat.name,
      position: cat.position,
      visibility: 'shared' as const,
    })),
  };
}

export type SeedData = ReturnType<typeof buildSeedData>;
