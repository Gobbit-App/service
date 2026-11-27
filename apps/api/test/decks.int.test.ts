import { describe, it, expect, beforeAll } from 'vitest';
import { addMember, createAccountUser, createDeck } from '@gobbit/db/test';
import type { UserRow } from '@gobbit/db';
import {
  deckDetailSchema,
  deckListSchema,
  deckWithCategoriesSchema,
  deckSchema,
  problemSchema,
} from '@gobbit/shared';
import { setupApiTest, fixtureId } from './helpers';

const ctx = setupApiTest();

describe('decks', () => {
  describe('POST /decks', () => {
    it('creates a deck with derived slug', async () => {
      const res = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Road Trip' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      const pb = deckWithCategoriesSchema.parse(body);
      expect(pb.slug).toBe('road-trip');
      expect(pb.kind).toBe('personal');
      expect(pb.categories).toHaveLength(1);
      const general = pb.categories[0];
      expect(general.slug).toBe('general');
      expect(general.isDefault).toBe(true);
    });

    it('rejects duplicate slug', async () => {
      const res = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Family' }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      problemSchema.parse(body);
    });

    it('rejects extra fields', async () => {
      const res = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'x', extra: 1 }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      const problem = problemSchema.parse(body);
      expect(problem.errors).toBeDefined();
      expect(Array.isArray(problem.errors)).toBe(true);
    });

    it('handles names that cannot be slugified', async () => {
      const res = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'שלום' }),
      });
      // Per brief: accept status 400 or 201; if 201 slug must match slug regex
      if (res.status === 201) {
        const body = await res.json();
        const pb = deckWithCategoriesSchema.parse(body);
        // slug regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
        expect(pb.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      } else if (res.status === 400) {
        const body = await res.json();
        problemSchema.parse(body);
      } else {
        throw new Error(`unexpected status ${res.status}`);
      }
    });
  });

  describe('GET /decks', () => {
    it('lists decks owned by user', async () => {
      const res = await ctx.app.request('/decks', {
        headers: ctx.as(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      const list = deckListSchema.parse(body);
      const slugs = list.data.map((pb) => pb.slug);
      expect(slugs).toContain('personal');
      expect(slugs).toContain('family');
      expect(slugs).toContain('scratch');
      expect(slugs).not.toContain('other-personal');
    });
  });

  describe('GET /decks/{id}', () => {
    it('gets deck by slug and by id return same data', async () => {
      const familyId = fixtureId('deck/family');

      const bySlugRes = await ctx.app.request('/decks/family', {
        headers: ctx.as(),
      });
      expect(bySlugRes.status).toBe(200);
      const bySlugBody = await bySlugRes.json();
      const bySlugPb = deckSchema.parse(bySlugBody);

      const byIdRes = await ctx.app.request(`/decks/${familyId}`, {
        headers: ctx.as(),
      });
      expect(byIdRes.status).toBe(200);
      const byIdBody = await byIdRes.json();
      const byIdPb = deckSchema.parse(byIdBody);

      expect(bySlugPb.id).toBe(byIdPb.id);
      expect(bySlugPb).toEqual(byIdPb);
    });

    describe('welcome (053, FR-001, FR-005)', () => {
      let joiner: UserRow;
      beforeAll(async () => {
        joiner = await createAccountUser(ctx.t.db);
        await ctx.sessionFor(joiner);
      });
      const get = async (deckId: string) => {
        const res = await ctx.app.request(`/decks/${deckId}`, { headers: ctx.as(joiner.email) });
        expect(res.status).toBe(200);
        return deckDetailSchema.parse(await res.json());
      };
      const membershipOf = async (deckId: string) =>
        (
          await ctx.t.pool.query('SELECT id FROM memberships WHERE deck_id = $1 AND user_id = $2', [
            deckId,
            joiner.id,
          ])
        ).rows[0].id as string;

      it('an address invite accepted through memberships.accept carries the inviter', async () => {
        const deck = await createDeck(ctx.t.db, ctx.world.owner);
        const inv = await ctx.app.request(`/decks/${deck.id}/invites`, {
          method: 'POST',
          headers: ctx.as(),
          body: JSON.stringify({ email: joiner.email, role: 'reader' }),
        });
        expect(inv.status).toBe(201);
        await ctx.t.pool.query(
          'UPDATE memberships SET accepted_at = now() WHERE deck_id = $1 AND user_id = $2',
          [deck.id, joiner.id],
        );
        const body = await get(deck.id);
        expect(body.welcome).toMatchObject({
          membershipId: await membershipOf(deck.id),
          inviter: { id: ctx.world.owner.id },
        });
        expect(JSON.stringify(body.welcome)).not.toContain('@');
        expect(body.welcome).not.toHaveProperty('inviter.email');
      });

      it('a link join carries the link creator as inviter', async () => {
        const deck = await createDeck(ctx.t.db, ctx.world.owner);
        const made = await ctx.app.request(`/decks/${deck.id}/invite-links`, {
          method: 'POST',
          headers: ctx.as(),
          body: JSON.stringify({ name: 'Cousins', role: 'reader' }),
        });
        const token = new URL((await made.json()).url).searchParams.get('t');
        const join = await ctx.app.request('/invite-links/accept', {
          method: 'POST',
          headers: ctx.as(joiner.email),
          body: JSON.stringify({ token }),
        });
        expect(join.status).toBe(200);
        const body = await get(deck.id);
        expect(body.welcome).toMatchObject({
          membershipId: await membershipOf(deck.id),
          inviter: { id: ctx.world.owner.id },
        });
        expect(JSON.stringify(body.welcome)).not.toContain('@');
      });

      it('is null for the creator, an owning-account user with or without a stray membership, and the personal deck (FR-003)', async () => {
        const deck = await createDeck(ctx.t.db, ctx.world.owner);
        const getAs = async (email: string, id: string) => {
          const res = await ctx.app.request(`/decks/${id}`, { headers: ctx.as(email) });
          expect(res.status).toBe(200);
          return deckDetailSchema.parse(await res.json()).welcome;
        };
        expect(await getAs(ctx.world.owner.email, deck.id)).toBeNull();

        // a trigger (reject_owner_account_membership) forbids a stray membership row for the owning account
        await expect(addMember(ctx.t.db, deck, ctx.world.owner, 'owner')).rejects.toThrow();

        const me = await createAccountUser(ctx.t.db);
        await ctx.sessionFor(me);
        await createDeck(ctx.t.db, me, { isDefault: true });
        expect(await getAs(me.email, 'me')).toBeNull();
      });

      it('inviter is null when invited_by is null or the inviter is deleted', async () => {
        const none = await createDeck(ctx.t.db, ctx.world.owner);
        await addMember(ctx.t.db, none, joiner, 'reader');
        const a = await get(none.id);
        expect(a.welcome).toMatchObject({
          membershipId: await membershipOf(none.id),
          inviter: null,
        });

        const gone = await createAccountUser(ctx.t.db);
        const deck = await createDeck(ctx.t.db, ctx.world.owner);
        await addMember(ctx.t.db, deck, joiner, 'reader', { invitedBy: gone.id });
        await ctx.t.pool.query('DELETE FROM users WHERE id = $1', [gone.id]);
        expect((await get(deck.id)).welcome).toMatchObject({ inviter: null });
      });
    });

    describe('DELETE /decks/{id}/welcome (053, FR-002, D480)', () => {
      let joiner: UserRow;
      beforeAll(async () => {
        joiner = await createAccountUser(ctx.t.db);
        await ctx.sessionFor(joiner);
      });
      const del = (deckId: string, headers: Record<string, string> = ctx.as(joiner.email)) =>
        ctx.app.request(`/decks/${deckId}/welcome`, { method: 'DELETE', headers });
      const welcomeOf = async (deckId: string) =>
        deckDetailSchema.parse(
          await (
            await ctx.app.request(`/decks/${deckId}`, { headers: ctx.as(joiner.email) })
          ).json(),
        ).welcome;

      it('dismisses (204), is idempotent, and the next GET has welcome null', async () => {
        const deck = await createDeck(ctx.t.db, ctx.world.owner);
        await addMember(ctx.t.db, deck, joiner, 'reader');
        expect(await welcomeOf(deck.id)).not.toBeNull();
        expect((await del(deck.id)).status).toBe(204);
        expect(await welcomeOf(deck.id)).toBeNull();
        expect((await del(deck.id)).status).toBe(204);
      });

      it('401 without a session', async () => {
        const deck = await createDeck(ctx.t.db, ctx.world.owner);
        expect((await del(deck.id, ctx.anon())).status).toBe(401);
      });

      it('404 for a deck the caller cannot read', async () => {
        const deck = await createDeck(ctx.t.db, ctx.world.owner);
        expect((await del(deck.id)).status).toBe(404);
        expect((await del('does-not-exist')).status).toBe(404);
      });

      it('leaves a pending (not accepted) row untouched', async () => {
        const deck = await createDeck(ctx.t.db, ctx.world.owner);
        await addMember(ctx.t.db, deck, joiner, 'reader', { acceptedAt: null });
        await del(deck.id);
        const r = await ctx.t.pool.query(
          'SELECT welcome_dismissed_at FROM memberships WHERE deck_id = $1 AND user_id = $2',
          [deck.id, joiner.id],
        );
        expect(r.rows[0].welcome_dismissed_at).toBeNull();
      });

      it('a new membership after removal and re-invite starts with a welcome', async () => {
        const deck = await createDeck(ctx.t.db, ctx.world.owner);
        await addMember(ctx.t.db, deck, joiner, 'reader');
        expect((await del(deck.id)).status).toBe(204);
        await ctx.t.pool.query('DELETE FROM memberships WHERE deck_id = $1 AND user_id = $2', [
          deck.id,
          joiner.id,
        ]);
        await addMember(ctx.t.db, deck, joiner, 'reader');
        expect(await welcomeOf(deck.id)).not.toBeNull();
      });
    });

    it('returns 404 for nonexistent deck', async () => {
      const res = await ctx.app.request('/decks/does-not-exist', {
        headers: ctx.as(),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      problemSchema.parse(body);
    });
  });

  describe('PATCH /decks/{id}', () => {
    it('updates deck', async () => {
      // First create one to update
      const createRes = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Patch Test' }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      const pbId = created.id;
      const originalUpdatedAt = created.updatedAt;

      // Small delay to ensure updatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const patchRes = await ctx.app.request(`/decks/${pbId}`, {
        method: 'PATCH',
        headers: ctx.as(),
        body: JSON.stringify({
          name: 'Road Trip 2026',
          isPublic: true,
        }),
      });
      expect(patchRes.status).toBe(200);
      const body = await patchRes.json();
      const pb = deckSchema.parse(body);
      expect(pb.name).toBe('Road Trip 2026');
      expect(pb.isPublic).toBe(true);
      expect(pb.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('rejects empty patch', async () => {
      const familyId = fixtureId('deck/family');
      const res = await ctx.app.request(`/decks/${familyId}`, {
        method: 'PATCH',
        headers: ctx.as(),
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      problemSchema.parse(body);
    });
  });

  describe('DELETE /decks/:id', () => {
    it('soft-deletes the deck, then 404s and frees the slug', async () => {
      const create = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Throwaway', slug: 'throwaway', kind: 'shared' }),
      });
      expect(create.status).toBe(201);
      const { id } = await create.json();

      const del = await ctx.app.request(`/decks/${id}`, { method: 'DELETE', headers: ctx.as() });
      expect(del.status).toBe(204);

      expect((await ctx.app.request(`/decks/${id}`, { headers: ctx.as() })).status).toBe(404);
      expect((await ctx.app.request('/decks/throwaway', { headers: ctx.as() })).status).toBe(404);
      const again = await ctx.app.request(`/decks/${id}`, { method: 'DELETE', headers: ctx.as() });
      expect(again.status).toBe(404);

      const list = await (await ctx.app.request('/decks', { headers: ctx.as() })).json();
      expect(list.data.map((d: { id: string }) => d.id)).not.toContain(id);

      const reuse = await ctx.app.request('/decks', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Throwaway', slug: 'throwaway', kind: 'shared' }),
      });
      expect(reuse.status).toBe(201);
      expect((await reuse.json()).id).not.toBe(id);
    });

    it("404s on another user's deck", async () => {
      const res = await ctx.app.request('/decks/other-personal', {
        method: 'DELETE',
        headers: ctx.as(),
      });
      expect(res.status).toBe(404);
    });
  });
});
