import { describe, it, expect, beforeAll } from 'vitest';
import {
  deckListSchema,
  deckSchema,
  deckWithCategoriesSchema,
  problemSchema,
} from '@gobbit/shared';
import type { UserRow } from '@gobbit/db';
import { createAccountUser, createDeck, defaultCategory } from '@gobbit/db/test';
import { json, setupApiTest } from './helpers';

describe('personal deck (Phase 3B)', () => {
  const ctx = setupApiTest();
  let owner: UserRow;
  let other: UserRow;
  let ownerPersonalId: string;

  beforeAll(async () => {
    owner = await createAccountUser(ctx.t.db);
    other = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(owner);
    await ctx.sessionFor(other);
    ownerPersonalId = (await createDeck(ctx.t.db, owner, { isDefault: true })).id;
    await createDeck(ctx.t.db, other, { isDefault: true });
  });

  describe('addressing with me', () => {
    it('GET /decks/me returns the personal deck with slug me and isDefault', async () => {
      const res = await ctx.app.request('/decks/me', { headers: ctx.as(owner.email) });
      expect(res.status).toBe(200);
      const deck = deckSchema.parse(await json(res));
      expect(deck).toMatchObject({ id: ownerPersonalId, slug: 'me', isDefault: true });
    });

    it('resolves me to the caller own deck, never another user', async () => {
      const res = await ctx.app.request('/decks/me', { headers: ctx.as(other.email) });
      const deck = deckSchema.parse(await json(res));
      expect(deck.id).not.toBe(ownerPersonalId);
    });

    it('GET /decks/me is 404 for a user without a personal deck', async () => {
      const bare = await createAccountUser(ctx.t.db);
      await ctx.sessionFor(bare);
      const res = await ctx.app.request('/decks/me', { headers: ctx.as(bare.email) });
      expect(res.status).toBe(404);
    });

    it('GET /decks lists the personal deck with slug me', async () => {
      const res = await ctx.app.request('/decks', { headers: ctx.as(owner.email) });
      expect(res.status).toBe(200);
      const list = deckListSchema.parse(await json(res));
      const personal = list.data.find((d) => d.id === ownerPersonalId);
      expect(personal).toMatchObject({ slug: 'me', isDefault: true, role: 'owner' });
    });

    it('serves items and categories of me, with the general category', async () => {
      const cats = await ctx.app.request('/decks/me/categories', { headers: ctx.as(owner.email) });
      expect(cats.status).toBe(200);
      const general = await defaultCategory(ctx.t.db, { id: ownerPersonalId });
      expect(general.slug).toBe('general');

      const items = await ctx.app.request('/decks/me/items', { headers: ctx.as(owner.email) });
      expect(items.status).toBe(200);
    });
  });

  describe('rules', () => {
    it('DELETE /decks/me is refused with 409 personal-deck', async () => {
      const res = await ctx.app.request('/decks/me', {
        method: 'DELETE',
        headers: ctx.as(owner.email),
      });
      expect(res.status).toBe(409);
      const problem = problemSchema.parse(await json(res));
      expect(problem.type).toBe('/problems/personal-deck');
    });

    it('PATCH /decks/me renames the personal deck', async () => {
      const res = await ctx.app.request('/decks/me', {
        method: 'PATCH',
        headers: ctx.as(owner.email),
        body: JSON.stringify({ name: 'Home' }),
      });
      expect(res.status).toBe(200);
      expect(deckSchema.parse(await json(res))).toMatchObject({ name: 'Home', slug: 'me' });
    });

    it('PATCH /decks/me refuses a new slug with 409', async () => {
      const res = await ctx.app.request('/decks/me', {
        method: 'PATCH',
        headers: ctx.as(owner.email),
        body: JSON.stringify({ slug: 'elsewhere' }),
      });
      expect(res.status).toBe(409);
      expect(problemSchema.parse(await json(res)).type).toBe('/problems/personal-deck');
    });

    it('PATCH /decks/me refuses changing visibility with 409', async () => {
      const res = await ctx.app.request('/decks/me', {
        method: 'PATCH',
        headers: ctx.as(owner.email),
        body: JSON.stringify({ isPublic: true }),
      });
      expect(res.status).toBe(409);
    });

    it('POST /decks refuses the name Me with 400 (derived slug me)', async () => {
      const res = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(owner.email),
        body: JSON.stringify({ name: 'Me' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /decks refuses an explicit slug me with 400', async () => {
      const res = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(owner.email),
        body: JSON.stringify({ name: 'Anything', slug: 'me' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /decks/me/invites is refused with 409 personal-deck', async () => {
      const invitee = await createAccountUser(ctx.t.db);
      const res = await ctx.app.request('/decks/me/invites', {
        method: 'POST',
        headers: ctx.as(owner.email),
        body: JSON.stringify({ email: invitee.email, role: 'reader' }),
      });
      expect(res.status).toBe(409);
      expect(problemSchema.parse(await json(res)).type).toBe('/problems/personal-deck');
    });

    it('a non-default deck can still be created and deleted', async () => {
      const created = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(owner.email),
        body: JSON.stringify({ name: 'Road Trip' }),
      });
      expect(created.status).toBe(201);
      const pb = deckWithCategoriesSchema.parse(await json(created));
      expect(pb.isDefault).toBe(false);
      expect(pb.slug).toBe('road-trip');

      const removed = await ctx.app.request(`/decks/${pb.id}`, {
        method: 'DELETE',
        headers: ctx.as(owner.email),
      });
      expect(removed.status).toBe(204);
    });
  });
});
