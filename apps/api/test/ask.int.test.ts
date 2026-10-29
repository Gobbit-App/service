import { beforeAll, describe, expect, it } from 'vitest';
import type { DeckRow, ItemRow, UserRow } from '@gobbit/db';
import { ASK_RATE_LIMIT_PER_HOUR } from '@gobbit/shared';
import { addMember, createAccountUser, createDeck, createItem } from '@gobbit/db/test';
import type { Asker } from '../src/ai/asker';
import { createFakeAsker, type FakeAskReply } from '../src/ai/fake-asker';
import { json, OWNER_EMAIL, setupApiTest, type ApiTestContext } from './helpers';

const CARD = { type: 'text', title: 'Wifi password', body: 'The router code is on the fridge' };

async function deckWithCard(ctx: ApiTestContext): Promise<{ deck: DeckRow; item: ItemRow }> {
  const deck = await createDeck(ctx.t.db, ctx.world.owner);
  const item = await createItem(ctx.t.db, deck, { card: CARD as never });
  return { deck, item };
}

const ask = (ctx: ApiTestContext, deck: DeckRow, question: string, email = OWNER_EMAIL) =>
  ctx.app.request(`/decks/${deck.slug}/ask`, {
    method: 'POST',
    headers: ctx.as(email),
    body: JSON.stringify({ question }),
  });

describe('ask (P4.4, D77)', () => {
  let reply: (cards: { id: string }[]) => FakeAskReply = (cards) => ({
    answer: 'On the fridge.',
    citedItemIds: cards.map((c) => c.id),
    grounded: true,
  });
  const asker = createFakeAsker((input) => reply(input.cards));
  const ctx = setupApiTest({ search: { embedder: null, asker } });
  let deck: DeckRow;
  let item: ItemRow;

  beforeAll(async () => {
    ({ deck, item } = await deckWithCard(ctx));
  });

  it('answers from retrieved cards and cites them', async () => {
    const res = await ask(ctx, deck, 'what is the wifi password?');
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      answer: 'On the fridge.',
      citations: [{ itemId: item.id, title: 'Wifi password' }],
      grounded: true,
    });
    expect(asker.calls.at(-1)?.cards.map((c) => c.id)).toEqual([item.id]);
  });

  it('records the call in llm_calls', async () => {
    const { rows } = await ctx.t.pool.query(
      `select purpose, provider, model from llm_calls where deck_id = $1 and purpose = 'ask'`,
      [deck.id],
    );
    expect(rows[0]).toMatchObject({ provider: 'fake', model: 'fake-ask' });
  });

  it('drops citations to cards it was not given and answers not-found', async () => {
    reply = () => ({
      answer: 'Made up.',
      citedItemIds: ['00000000-0000-4000-8000-000000000000'],
      grounded: true,
    });
    const body = await json(await ask(ctx, deck, 'what is the wifi password?'));
    expect(body.grounded).toBe(false);
    expect(body.citations).toEqual([]);
    expect(body.answer).not.toBe('Made up.');
  });

  it('answers not-found without calling the model when nothing matches', async () => {
    const before = asker.calls.length;
    const body = await json(await ask(ctx, deck, 'zebra migration'));
    expect(body.grounded).toBe(false);
    expect(asker.calls.length).toBe(before);
  });

  it('maps a provider failure to 503', async () => {
    reply = () => {
      throw new Error('boom');
    };
    const res = await ask(ctx, deck, 'what is the wifi password?');
    expect(res.status).toBe(503);
    expect((await json(res)).type).toBe('/problems/unavailable');
  });

  it('rejects a too-short question with 400', async () => {
    expect((await ask(ctx, deck, 'hi')).status).toBe(400);
  });

  it(`limits each user to ${ASK_RATE_LIMIT_PER_HOUR} asks per hour`, async () => {
    const user: UserRow = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, user, 'reader');
    await ctx.sessionFor(user);
    for (let i = 0; i < ASK_RATE_LIMIT_PER_HOUR; i++) {
      expect((await ask(ctx, deck, 'zebra migration', user.email)).status).toBe(200);
    }
    expect((await ask(ctx, deck, 'zebra migration', user.email)).status).toBe(429);
  });
});

describe('ask without a provider (D73)', () => {
  const ctx = setupApiTest({ search: { embedder: null, asker: null } });

  it('is 503', async () => {
    const { deck } = await deckWithCard(ctx);
    expect((await ask(ctx, deck, 'what is the wifi password?')).status).toBe(503);
  });
});

describe('ask deadline', () => {
  /** Never answers on its own; rejects when the service aborts it. */
  const hangingAsker: Asker = {
    provider: 'fake',
    model: 'fake-ask',
    ask: (_input, opts) =>
      new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  };
  const ctx = setupApiTest({
    search: { embedder: null, asker: hangingAsker, askTimeoutMs: 50 },
  });

  it('is 504 when the model does not answer in time', async () => {
    const { deck } = await deckWithCard(ctx);
    const res = await ask(ctx, deck, 'what is the wifi password?');
    expect(res.status).toBe(504);
    expect((await json(res)).type).toBe('/problems/timeout');
  });
});
