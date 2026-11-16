import { describe, expect, it, vi } from 'vitest';
import type { ItemRow } from '@gobbit/db';
import { createItemDtoMapper } from './item-dtos';
import { createMemberSummaries } from './member-summaries';

const U1 = '11111111-1111-4111-8111-111111111111';
const DECK_A = 'a0000000-0000-4000-8000-000000000001';
const DECK_B = 'b0000000-0000-4000-8000-000000000002';
const DECK_P = 'c0000000-0000-4000-8000-000000000003';

function row(id: string, deckId: string, createdBy: string | null): ItemRow {
  return {
    id,
    deckId,
    type: 'text',
    status: 'published',
    title: 't',
    body: 'b',
    payload: {},
    entities: [],
    sourceUrl: null,
    cover: null,
    sourceKind: 'user',
    verifiedAt: null,
    createdBy,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
  } as unknown as ItemRow;
}

function setup() {
  const summariesByIds = vi.fn(async (ids: string[]) =>
    ids.includes(U1)
      ? [
          {
            id: U1,
            firstName: 'Ada',
            lastName: 'Lovelace',
            username: 'ada',
            avatar: null,
            email: 'ada@example.com',
          },
        ]
      : [],
  );
  const kindsByIds = vi.fn(
    async () =>
      new Map<string, 'personal' | 'shared'>([
        [DECK_A, 'shared'],
        [DECK_B, 'shared'],
        [DECK_P, 'personal'],
      ]),
  );
  const summaries = createMemberSummaries({ users: { summariesByIds } as never });
  const map = createItemDtoMapper({
    items: { categoryIdsFor: async () => new Map() },
    favorites: { favoritedAmong: async () => new Set() },
    linkChecks: { flagsFor: async () => new Map() },
    decks: { kindsByIds },
    summaries,
  });
  const user = { id: 'viewer' } as never;
  return { map: (rows: ItemRow[]) => map(user, rows, 'owner'), summariesByIds, kindsByIds };
}

describe('item DTO creator', () => {
  it('is null in a personal deck', async () => {
    const [dto] = await setup().map([row('i1', DECK_P, U1)]);
    expect(dto!.creator).toBeNull();
    expect(dto!.createdBy).toBe(U1);
  });

  it('is the member summary in a shared deck, without email', async () => {
    const [dto] = await setup().map([row('i1', DECK_A, U1)]);
    expect(dto!.creator).toMatchObject({ id: U1, name: 'Ada Lovelace', username: 'ada' });
    expect(JSON.stringify(dto)).not.toContain('email');
    expect(JSON.stringify(dto)).not.toContain('example.com');
  });

  it('is the placeholder when createdBy is null or the user is unknown', async () => {
    const dtos = await setup().map([row('i1', DECK_A, null), row('i2', DECK_A, 'gone')]);
    for (const d of dtos) expect(d.creator).toMatchObject({ id: null, name: null, photo: null });
  });

  it('does one summaries call and one deck-kind lookup for many items across decks', async () => {
    const s = setup();
    await s.map([row('i1', DECK_A, U1), row('i2', DECK_B, U1), row('i3', DECK_A, null)]);
    expect(s.summariesByIds).toHaveBeenCalledTimes(1);
    expect(s.kindsByIds).toHaveBeenCalledTimes(1);
  });
});
