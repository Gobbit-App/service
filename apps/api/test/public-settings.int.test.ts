import { beforeAll, describe, expect, it } from 'vitest';
import type { CategoryRow, DeckRow, UserRow } from '@pb/db';
import {
  addMember,
  createAccountUser,
  createCategory,
  createDeck,
  defaultCategory,
} from '@pb/db/test';
import { categorySchema, deckSchema, type MemberRole } from '@pb/shared';
import { createDecksRepo } from '../src/repositories/decks.repo';
import { json, OTHER_EMAIL, OWNER_EMAIL, setupApiTest } from './helpers';

/** D176: admins choose what is public — category PATCH and the owner-only public switch. */
describe('public settings (D176)', () => {
  const ctx = setupApiTest();
  let deck: DeckRow;
  let category: CategoryRow;
  let general: CategoryRow;
  const members = {} as Record<'coOwner' | MemberRole, UserRow>;

  beforeAll(async () => {
    const db = ctx.t.db;
    deck = await createDeck(db, ctx.world.owner, { slug: 'street', kind: 'communal' });
    category = await createCategory(db, deck, { slug: 'schools', name: 'Schools' });
    general = await defaultCategory(db, deck);

    for (const role of ['owner', 'maintainer', 'editor', 'reader'] as const) {
      const user = await createAccountUser(db);
      await addMember(db, deck, user, role);
      await ctx.sessionFor(user);
      members[role === 'owner' ? 'coOwner' : role] = user;
    }
  });

  const patch = (path: string, email: string, body: unknown) =>
    ctx.app.request(path, { method: 'PATCH', headers: ctx.as(email), body: JSON.stringify(body) });
  const patchCategory = (email: string, body: unknown, id = category.id) =>
    patch(`/decks/street/categories/${id}`, email, body);

  describe('PATCH /decks/{id}/categories/{categoryId}', () => {
    it('owner renames; the slug stays', async () => {
      const res = await patchCategory(OWNER_EMAIL, { name: 'Local schools' });
      expect(res.status).toBe(200);
      const body = categorySchema.parse(await json(res));
      expect(body.name).toBe('Local schools');
      expect(body.slug).toBe('schools');
    });

    it('maintainer makes it public', async () => {
      const res = await patchCategory(members.maintainer.email, { visibility: 'public' });
      expect(res.status).toBe(200);
      expect((await json(res)).visibility).toBe('public');
    });

    it('editor and reader → 403', async () => {
      for (const role of ['editor', 'reader'] as const) {
        const res = await patchCategory(members[role].email, { name: 'Nope' });
        expect(res.status, role).toBe(403);
      }
    });

    it('non-member → 404', async () => {
      expect((await patchCategory(OTHER_EMAIL, { name: 'Nope' })).status).toBe(404);
    });

    it('empty body, unknown key or slug change → 400', async () => {
      expect((await patchCategory(OWNER_EMAIL, {})).status).toBe(400);
      expect((await patchCategory(OWNER_EMAIL, { slug: 'new' })).status).toBe(400);
      expect((await patchCategory(OWNER_EMAIL, { visibility: 'secret' })).status).toBe(400);
    });

    it('unknown or foreign category → 404', async () => {
      const foreign = ctx.world.categories.school.id;
      expect((await patchCategory(OWNER_EMAIL, { name: 'X' }, foreign)).status).toBe(404);
      const unknown = '00000000-0000-4000-8000-000000000000';
      expect((await patchCategory(OWNER_EMAIL, { name: 'X' }, unknown)).status).toBe(404);
    });

    it('the default category keeps isDefault when renamed or made public', async () => {
      const res = await patchCategory(
        OWNER_EMAIL,
        { name: 'Everything', visibility: 'public' },
        general.id,
      );
      expect(res.status).toBe(200);
      const body = categorySchema.parse(await json(res));
      expect(body.isDefault).toBe(true);
      expect(body.slug).toBe(general.slug);
    });
  });

  describe('PATCH /decks/{id} isPublic', () => {
    it('owner and co-owner may switch it', async () => {
      const asOwner = await patch('/decks/street', OWNER_EMAIL, { isPublic: true });
      expect(asOwner.status).toBe(200);
      expect(deckSchema.parse(await json(asOwner)).isPublic).toBe(true);

      const asCoOwner = await patch('/decks/street', members.coOwner.email, { isPublic: false });
      expect(asCoOwner.status).toBe(200);
      expect((await json(asCoOwner)).isPublic).toBe(false);
    });

    it('maintainer → 403 owner-required, but may still rename the deck', async () => {
      const res = await patch('/decks/street', members.maintainer.email, { isPublic: true });
      expect(res.status).toBe(403);
      expect((await json(res)).type).toBe('/problems/owner-required');

      const rename = await patch('/decks/street', members.maintainer.email, { name: 'The street' });
      expect(rename.status).toBe(200);
    });

    it('personal deck → 409 personal-deck', async () => {
      await createDeck(ctx.t.db, ctx.world.owner, { isDefault: true });
      const res = await patch('/decks/me', OWNER_EMAIL, { isPublic: true });
      expect(res.status).toBe(409);
      expect((await json(res)).type).toBe('/problems/personal-deck');
    });
  });

  describe('PATCH /decks/{id} autoPublishShares (D192)', () => {
    it('owner and co-owner may switch it', async () => {
      const on = await patch('/decks/street', OWNER_EMAIL, { autoPublishShares: true });
      expect(on.status).toBe(200);
      expect(deckSchema.parse(await json(on)).autoPublishShares).toBe(true);

      const off = await patch('/decks/street', members.coOwner.email, {
        autoPublishShares: false,
      });
      expect(off.status).toBe(200);
      expect(deckSchema.parse(await json(off)).autoPublishShares).toBe(false);
    });

    it('maintainer → 403 owner-required', async () => {
      const res = await patch('/decks/street', members.maintainer.email, {
        autoPublishShares: true,
      });
      expect(res.status).toBe(403);
      expect((await json(res)).type).toBe('/problems/owner-required');
    });

    it('may be switched on the personal deck', async () => {
      await createDeck(ctx.t.db, members.coOwner, { isDefault: true });
      const res = await patch('/decks/me', members.coOwner.email, { autoPublishShares: false });
      expect(res.status).toBe(200);
      expect(deckSchema.parse(await json(res)).autoPublishShares).toBe(false);
    });

    it('a newly ensured personal deck has it on', async () => {
      const user = await createAccountUser(ctx.t.db);
      const deck = await createDecksRepo(ctx.t.db).ensureDefault({
        accountId: user.accountId,
        name: 'Mine',
      });
      expect(deck.autoPublishShares).toBe(true);
    });
  });
});
