import { beforeAll, describe, expect, it } from 'vitest';
import type { DeckRow, ItemRow, UserRow } from '@pb/db';
import { EMBEDDING_DIMS } from '@pb/shared';
import { addMember, createAccountUser, createCategory, createDeck, createItem } from '@pb/db/test';
import { axisVector, createFakeEmbedder } from '../src/ai/fake-embedder';
import { createEmbedItemHandler } from '../src/jobs/embed-item';
import { createEmbeddingsRepo } from '../src/repositories/embeddings.repo';
import { createLlmCallsRepo } from '../src/repositories/llm-calls.repo';
import { json, OTHER_EMAIL, OWNER_EMAIL, setupApiTest } from './helpers';

const overrides: Record<string, number[]> = {};
const embedder = createFakeEmbedder({ overrides });

interface Hit {
  item: { id: string; title: string };
  why: 'text' | 'semantic' | 'both';
  score: number;
}

describe('deck search (P4.2, D75/D76)', () => {
  const ctx = setupApiTest({ search: { embedder } });
  let deck: DeckRow;
  let reader: UserRow;
  let wifi: ItemRow;
  let shalom: ItemRow;
  let dentist: ItemRow;
  let secret: ItemRow;

  const normalize = async (text: string): Promise<string> =>
    (await ctx.t.pool.query<{ n: string }>('select search_normalize($1) as n', [text])).rows[0]!.n;

  /** Embeds an item through the real job handler with a chosen vector for its search text. */
  async function embedAs(item: ItemRow, vector: number[]): Promise<void> {
    const embeddings = createEmbeddingsRepo(ctx.t.db);
    const target = await embeddings.loadForEmbedding(item.id, embedder.model);
    overrides[target!.searchText] = vector;
    const handler = createEmbedItemHandler({
      embedder,
      embeddings,
      llmCalls: createLlmCallsRepo(ctx.t.db),
    });
    expect(await handler(item.id)).toBe('embedded');
  }

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    const privateCat = await createCategory(ctx.t.db, deck, { visibility: 'private' });

    wifi = await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'Wifi password', body: 'The router code is on the fridge' },
    });
    shalom = await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'שָׁלוֹם עֲלֵיכֶם', body: 'ברכה לשבת' },
    });
    dentist = await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'Dr. Levi', body: 'Appointments on Tuesdays' },
    });
    secret = await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'Wifi password for the office', body: 'private' },
      categoryIds: [privateCat.id],
    });
    await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'Wifi password archived', body: 'unpublished' },
      status: 'archived',
    });
    const otherDeck = await createDeck(ctx.t.db, ctx.world.owner);
    await createItem(ctx.t.db, otherDeck, {
      card: { type: 'text', title: 'Wifi password elsewhere', body: 'other deck' },
    });

    await embedAs(dentist, axisVector(EMBEDDING_DIMS, 7));
    overrides[await normalize('tooth doctor')] = axisVector(EMBEDDING_DIMS, 7);

    reader = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, reader, 'reader');
    await ctx.sessionFor(reader);
  });

  const search = (q: string, email = OWNER_EMAIL) =>
    ctx.app.request(`/decks/${deck.slug}/search?${new URLSearchParams({ q })}`, {
      headers: ctx.as(email),
    });

  const hits = async (q: string, email = OWNER_EMAIL): Promise<Hit[]> => {
    const res = await search(q, email);
    expect(res.status).toBe(200);
    return (await json(res)).data;
  };

  it('finds a card by a substring of its title', async () => {
    const data = await hits('wifi');
    expect(data.map((h) => h.item.id)).toContain(wifi.id);
    expect(data.find((h) => h.item.id === wifi.id)?.why).toMatch(/text|both/);
  });

  it('tolerates a typo through trigram word similarity', async () => {
    expect((await hits('pasword')).map((h) => h.item.id)).toContain(wifi.id);
  });

  it('matches Hebrew regardless of niqqud', async () => {
    expect((await hits('שלום')).map((h) => h.item.id)).toContain(shalom.id);
  });

  it('finds a card by meaning through the vector arm', async () => {
    const res = await search('tooth doctor');
    const body = await json(res);
    expect(body.semantic).toBe(true);
    expect(body.data[0].item.id).toBe(dentist.id);
    expect(body.data[0].why).toBe('semantic');
  });

  it('excludes archived cards, other decks; the owner sees private categories', async () => {
    const titles = (await hits('wifi password')).map((h) => h.item.title);
    expect(titles).toContain('Wifi password for the office');
    expect(titles).not.toContain('Wifi password archived');
    expect(titles).not.toContain('Wifi password elsewhere');
  });

  it('a reader never sees a card only in a private category', async () => {
    const ids = (await hits('wifi password', reader.email)).map((h) => h.item.id);
    expect(ids).toContain(wifi.id);
    expect(ids).not.toContain(secret.id);
  });

  it('is 404 for a non-member and 400 for an empty query', async () => {
    expect((await search('wifi', OTHER_EMAIL)).status).toBe(404);
    expect((await search('   ')).status).toBe(400);
  });

  it('logs the normalized query (D80)', async () => {
    await hits('Fridge');
    await new Promise((r) => setTimeout(r, 50));
    const { rows } = await ctx.t.pool.query(
      `select mode, q_normalized, result_count from search_queries where deck_id = $1 and q_normalized = 'fridge'`,
      [deck.id],
    );
    expect(rows[0]).toMatchObject({ mode: 'search', result_count: 1 });
  });
});

describe('deck search without an embedder (D73)', () => {
  const ctx = setupApiTest({ search: { embedder: null } });

  it('runs text-only and reports semantic: false', async () => {
    const deck = await createDeck(ctx.t.db, ctx.world.owner);
    const item = await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'Garbage day', body: 'Bins out on Monday night' },
    });
    const res = await ctx.app.request(`/decks/${deck.slug}/search?q=bins`, { headers: ctx.as() });
    const body = await json(res);
    expect(body.semantic).toBe(false);
    expect(body.data.map((h: Hit) => h.item.id)).toEqual([item.id]);
  });
});
