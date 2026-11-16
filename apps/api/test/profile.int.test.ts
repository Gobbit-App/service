import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryRow, DeckRow, ItemRow, UserRow } from '@gobbit/db';
import {
  addFavorite,
  addMember,
  createAccountUser,
  createCategory,
  createDeck,
  createItem,
} from '@gobbit/db/test';
import { createFakeEmbedder } from '../src/ai/fake-embedder';
import { json, OWNER_EMAIL, setupApiTest } from './helpers';

/** 046 traceability: part 1 (profile, username, lookup, invite by username). */
describe('profile (046 part 1)', () => {
  const ctx = setupApiTest();
  const ingestToken = `ing_${'A'.repeat(43)}`;

  const req = (path: string, method: string, email: string, body?: unknown) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(email),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const patch = (u: UserRow, body: unknown) => req('/me/profile', 'PATCH', u.email, body);
  const me = async (u: UserRow) => (await json(await req('/me', 'GET', u.email))).profile;
  const check = (u: UserRow, username: string) =>
    req('/me/username/check', 'POST', u.email, { username });
  const lookup = (u: UserRow, query: string) => req('/members/lookup', 'POST', u.email, { query });
  const invite = (email: string, body: unknown) =>
    req('/decks/family/invites', 'POST', email, body);
  /** Problem body without the per-request fields. */
  const problem = async (res: Response) => {
    const body = await json(res);
    delete body.requestId;
    delete body.instance;
    return body;
  };
  const profileEvents = async (u: UserRow) =>
    (await ctx.t.pool.query('SELECT changes FROM profile_events WHERE user_id = $1', [u.id])).rows;

  async function member(opts: Parameters<typeof createAccountUser>[1] = {}): Promise<UserRow> {
    const u = await createAccountUser(ctx.t.db, opts);
    await ctx.sessionFor(u);
    return u;
  }

  describe('GET /me and PATCH /me/profile', () => {
    it('returns the profile on /me, round trips and persists', async () => {
      const u = await member();
      expect(await me(u)).toMatchObject({
        username: null,
        firstName: null,
        lastName: null,
        location: null,
        avatar: null,
      });

      const res = await patch(u, {
        username: 'Round.Trip',
        firstName: ' Ada ',
        lastName: 'Lovelace',
        location: 'London',
      });
      expect(res.status).toBe(200);
      const saved = await json(res);
      expect(saved).toMatchObject({
        username: 'Round.Trip',
        firstName: 'Ada',
        lastName: 'Lovelace',
        location: 'London',
      });
      expect(await me(u)).toMatchObject(saved);
    });

    it('clearing one field keeps the others', async () => {
      const u = await member({ firstName: 'Keep', lastName: 'Me', location: 'Here' });
      for (const body of [{ location: null }, { lastName: '   ' }]) {
        expect((await patch(u, body)).status).toBe(200);
      }
      expect(await me(u)).toMatchObject({ firstName: 'Keep', lastName: null, location: null });
    });

    it('422 over the limits', async () => {
      const u = await member();
      expect((await patch(u, { firstName: 'x'.repeat(61) })).status).toBe(422);
      expect((await patch(u, { location: 'y'.repeat(101) })).status).toBe(422);
      const ok = await patch(u, { firstName: 'x'.repeat(60), location: 'y'.repeat(100) });
      expect(ok.status).toBe(200);
    });

    it('422 with a reason for invalid, reserved and taken usernames', async () => {
      const taker = await member({ username: 'taken-name' });
      const u = await member();
      const invalid = await patch(u, { username: 'a b' });
      expect(invalid.status).toBe(422);
      expect(JSON.stringify(await json(invalid))).toContain('invalid');
      const reserved = await patch(u, { username: 'admin' });
      expect(reserved.status).toBe(422);
      expect(JSON.stringify(await json(reserved))).toContain('reserved');
      const taken = await patch(u, { username: 'TAKEN-name' });
      expect(taken.status).toBe(422);
      expect((await json(taken)).errors).toEqual([{ path: 'username', message: 'unavailable' }]);
      expect((await me(taker)).username).toBe('taken-name');
    });

    it('two members racing for one username: one 200, one 422', async () => {
      const [a, b] = [await member(), await member()];
      const res = await Promise.all([
        patch(a, { username: 'race-name' }),
        patch(b, { username: 'race-name' }),
      ]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 422]);
    });

    it('a released name is held for others, allowed for the releaser, same 422 as taken', async () => {
      const a = await member({ username: 'held-old' });
      const b = await member();
      await member({ username: 'really-taken' });
      expect((await patch(a, { username: 'held-new' })).status).toBe(200);

      const held = await patch(b, { username: 'held-old' });
      const taken = await patch(b, { username: 'really-taken' });
      expect(held.status).toBe(422);
      expect(await problem(held)).toEqual(await problem(taken));

      expect((await patch(a, { username: 'held-old' })).status).toBe(200);
    });

    it('writes a profile_events row with field names only, in the same transaction', async () => {
      const u = await member({ firstName: 'Old' });
      const res = await patch(u, { firstName: 'Secret', location: 'Paris', username: 'evt-name' });
      expect(res.status).toBe(200);
      const rows = await profileEvents(u);
      expect(rows).toHaveLength(1);
      expect([...rows[0].changes].sort()).toEqual(['firstName', 'location', 'username']);
      expect(JSON.stringify(rows)).not.toMatch(/Secret|Paris|evt-name/);

      // a no-op writes nothing
      expect((await patch(u, { firstName: 'Secret' })).status).toBe(200);
      expect(await profileEvents(u)).toHaveLength(1);
    });

    it('a refused username leaves no event and no other change', async () => {
      await member({ username: 'rollback-taken' });
      const u = await member({ firstName: 'Before' });
      const res = await patch(u, { firstName: 'After', username: 'rollback-taken' });
      expect(res.status).toBe(422);
      expect((await me(u)).firstName).toBe('Before');
      expect(await profileEvents(u)).toHaveLength(0);
    });
  });

  describe('POST /me/username/check', () => {
    it('answers available, invalid, reserved and unavailable (taken and held alike)', async () => {
      await member({ username: 'chk-taken' });
      const a = await member({ username: 'chk-old' });
      await patch(a, { username: 'chk-new' });
      const u = await member();
      const answer = async (name: string) => json(await check(u, name));

      expect(await answer('chk-free')).toEqual({ available: true });
      expect(await answer('a b')).toEqual({ available: false, reason: 'invalid' });
      expect(await answer('admin')).toEqual({ available: false, reason: 'reserved' });
      const taken = await answer('chk-taken');
      expect(taken).toEqual({ available: false, reason: 'unavailable' });
      expect(await answer('chk-old')).toEqual(taken);
      // the releaser sees their own held name as available
      expect(await json(await check(a, 'chk-old'))).toEqual({ available: true });
    });
  });

  describe('POST /members/lookup', () => {
    it('finds by username (case-insensitive) without email or location', async () => {
      const target = await member({ username: 'Look.Up', location: 'Secret City' });
      const caller = await member();
      const res = await lookup(caller, 'look.UP');
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.member).toMatchObject({ id: target.id, username: 'Look.Up' });
      expect(body.member).not.toHaveProperty('email');
      expect(body.member).not.toHaveProperty('location');
      expect(JSON.stringify(body)).not.toMatch(/Secret City|@/);
    });

    it('finds a deck mate by email; a stranger or unknown address is the same miss', async () => {
      const mate = await member();
      await addMember(ctx.t.db, ctx.world.decks.family, mate, 'reader');
      const stranger = await member();
      const caller = await member();
      await addMember(ctx.t.db, ctx.world.decks.family, caller, 'reader');

      const hit = await json(await lookup(caller, mate.email.toUpperCase()));
      expect(hit.member).toMatchObject({ id: mate.id });
      expect(hit.member).not.toHaveProperty('email');

      const miss = await json(await lookup(caller, stranger.email));
      const never = await json(await lookup(caller, 'never-existed@example.test'));
      expect(miss).toEqual({ member: null });
      expect(never).toEqual(miss);
    });

    it('a soft-deleted member is a miss', async () => {
      const gone = await member({ username: 'gone-user' });
      const caller = await member();
      await ctx.t.pool.query('UPDATE users SET deleted_at = now() WHERE id = $1', [gone.id]);
      expect(await json(await lookup(caller, 'gone-user'))).toEqual({ member: null });
    });

    it('the 31st call within the hour is 429', async () => {
      const caller = await member();
      for (let i = 0; i < 30; i++) {
        expect((await lookup(caller, `nobody-${i}`)).status).toBe(200);
      }
      const res = await lookup(caller, 'nobody-31');
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).not.toBeNull();
    });
  });

  describe('invite by username', () => {
    beforeEach(() => ctx.mailer.clear());

    it('invites, mails the member, and never returns the address', async () => {
      const invitee = await member({ username: 'invite-me' });
      const res = await invite(OWNER_EMAIL, { username: 'Invite-Me', role: 'reader' });
      expect(res.status).toBe(201);
      expect(JSON.stringify(await json(res))).not.toContain(invitee.email);
      expect(ctx.mailer.sent).toHaveLength(1);
      expect(ctx.mailer.sent[0].to).toBe(invitee.email);
    });

    it('/members shows email null for a username holder to others, the real one to themselves', async () => {
      const u = await member({ username: 'masked-one' });
      await addMember(ctx.t.db, ctx.world.decks.family, u, 'reader');
      const emailOf = async (viewerEmail: string) =>
        (await json(await req('/decks/family/members', 'GET', viewerEmail))).data.find(
          (m: { userId: string }) => m.userId === u.id,
        ).email;
      expect(await emailOf(OWNER_EMAIL)).toBeNull();
      expect(await emailOf(u.email)).toBe(u.email);
    });

    it('unknown and released usernames answer the same 404', async () => {
      const a = await member({ username: 'rel-old' });
      await patch(a, { username: 'rel-new' });
      const unknown = await invite(OWNER_EMAIL, { username: 'no-such-member' });
      const released = await invite(OWNER_EMAIL, { username: 'rel-old' });
      expect(unknown.status).toBe(404);
      expect(await problem(released)).toEqual(await problem(unknown));
      expect(ctx.mailer.sent).toHaveLength(0);
    });
  });

  describe('session-only routes and owner-only location', () => {
    it('an ingest token is refused on every new route', async () => {
      const headers = {
        Authorization: `Bearer ${ingestToken}`,
        'Content-Type': 'application/json',
      };
      const calls: [string, string, unknown?][] = [
        ['GET', '/me'],
        ['PATCH', '/me/profile', { firstName: 'x' }],
        ['POST', '/me/username/check', { username: 'abc' }],
        ['POST', '/members/lookup', { query: 'abc' }],
        ['POST', '/decks/family/invites', { username: 'abc' }],
      ];
      for (const [method, path, body] of calls) {
        const res = await ctx.app.request(path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        expect(res.status, `${method} ${path}`).toBe(401);
      }
    });

    it('location appears only on /me', async () => {
      const u = await member({ username: 'loc-user', location: 'Hidden Town' });
      await addMember(ctx.t.db, ctx.world.decks.family, u, 'reader');
      const viewer = await member();

      expect(await (await req('/me', 'GET', u.email)).text()).toContain('Hidden Town');
      const others = [
        await lookup(viewer, 'loc-user'),
        await req('/decks/family/members', 'GET', OWNER_EMAIL),
        await req('/decks/family/members', 'GET', u.email),
        await check(viewer, 'loc-user'),
      ];
      for (const res of others) {
        expect(res.status).toBe(200);
        expect(await res.text()).not.toMatch(/Hidden Town|"location"/);
      }
    });
  });
});

/** 046 traceability: part 2 (creator on cards, FR-004/005/006/010/012/014). */
describe('profile (046 part 2: creator)', () => {
  const embedder = createFakeEmbedder();
  const ctx = setupApiTest({ search: { embedder } });

  const text = (title: string, body = '') => ({ type: 'text' as const, title, body, payload: {} });
  const call = (path: string, email: string, method = 'GET', body?: unknown) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(email),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const getJson = async (path: string, email: string) => {
    const res = await call(path, email);
    expect(res.status, path).toBe(200);
    return json(res);
  };
  const anon = (path: string) => ctx.app.request(path, { headers: ctx.anon() });
  const idsOf = (page: { data: { id: string }[] }) => page.data.map((i) => i.id);

  /** Fails when a body carries a member's email (or the name derived from it) or location; `keys` also bans the keys. */
  const expectNoLeak = (body: unknown, who: UserRow, keys = true) => {
    const s = typeof body === 'string' ? body : JSON.stringify(body);
    expect(s).not.toContain(who.email);
    expect(s).not.toContain(who.email.split('@')[0]!);
    expect(s).not.toContain('Atlantis');
    if (keys) expect(s).not.toMatch(/"(email|location)"\s*:/);
  };

  let ada: UserRow; // names + username + location
  let quiet: UserRow; // no names at all
  let shadow: UserRow; // author of the category-hidden card
  let gone: UserRow; // removed in beforeAll
  let maintainer: UserRow;
  let reader: UserRow;
  let crew: DeckRow;
  let pub: DeckRow;
  let communal: DeckRow;
  let personal: DeckRow;
  let hidden: CategoryRow;
  let extras: CategoryRow;
  const cards: Record<string, ItemRow> = {};

  async function joined(
    deck: DeckRow,
    role: 'reader' | 'editor' | 'maintainer',
    opts: Parameters<typeof createAccountUser>[1] = {},
  ): Promise<UserRow> {
    const u = await createAccountUser(ctx.t.db, opts);
    await ctx.sessionFor(u);
    await addMember(ctx.t.db, deck, u, role);
    return u;
  }

  beforeAll(async () => {
    const db = ctx.t.db;
    const owner = ctx.world.owner;
    crew = await createDeck(db, owner, { slug: 'crew' });
    hidden = await createCategory(db, crew, { slug: 'hidden', visibility: 'private' });
    extras = await createCategory(db, crew, { slug: 'extras', visibility: 'shared' });
    ada = await joined(crew, 'editor', {
      username: 'ada-l',
      firstName: 'Ada',
      lastName: 'Lovelace',
      location: 'Atlantis',
    });
    quiet = await joined(crew, 'editor', { email: 'quiet.person@example.test' });
    shadow = await joined(crew, 'editor', { username: 'shadow-writer', location: 'Atlantis' });
    maintainer = await joined(crew, 'maintainer');
    reader = await joined(crew, 'reader');
    gone = await createAccountUser(db);

    cards.ada = await createItem(db, crew, {
      card: text('Zebracorn one', 'findable'),
      createdBy: ada.id,
      categoryIds: [extras.id],
    });
    cards.quiet = await createItem(db, crew, { card: text('Quiet card'), createdBy: quiet.id });
    cards.hidden = await createItem(db, crew, {
      card: text('Zebracorn secret', 'findable'),
      createdBy: shadow.id,
      categoryIds: [hidden.id],
    });
    cards.gone = await createItem(db, crew, { card: text('Orphan card'), createdBy: gone.id });
    cards.proposal = await createItem(db, crew, {
      card: text('Proposed one'),
      createdBy: ada.id,
      status: 'proposed',
      verifiedAt: null,
    });
    await addFavorite(db, reader, cards.ada);
    await addFavorite(db, reader, cards.hidden);
    await ctx.t.pool.query('DELETE FROM users WHERE id = $1', [gone.id]);

    personal = await createDeck(db, ada, { isDefault: true });
    cards.personal = await createItem(db, personal, { card: text('Mine'), createdBy: ada.id });

    communal = await createDeck(db, owner, { slug: 'street', kind: 'communal' });
    await addMember(db, communal, reader, 'reader');
    cards.communal = await createItem(db, communal, { card: text('Bins'), createdBy: ada.id });

    pub = await createDeck(db, owner, { slug: 'open-street', kind: 'communal', isPublic: true });
    const open = await createCategory(db, pub, { slug: 'open', visibility: 'public' });
    cards.pub = await createItem(db, pub, {
      card: text('Zebracorn public', 'findable'),
      createdBy: ada.id,
      categoryIds: [open.id],
    });
  });

  const expectAda = (creator: unknown) =>
    expect(creator).toEqual({
      id: ada.id,
      name: 'Ada Lovelace',
      username: 'ada-l',
      initials: 'AL',
      photo: null,
    });

  describe('summary shape on every card path (FR-004)', () => {
    it('one item, deck list, favorites and category listing', async () => {
      const one = await getJson(`/items/${cards.ada.id}`, reader.email);
      expectAda(one.creator);

      const list = await getJson('/decks/crew/items?limit=50', reader.email);
      expectAda(list.data.find((i: { id: string }) => i.id === cards.ada.id).creator);

      const favs = await getJson('/decks/crew/items?favorite=true&limit=50', reader.email);
      expectAda(favs.data.find((i: { id: string }) => i.id === cards.ada.id).creator);

      const cat = await getJson('/decks/crew/items?category=extras&limit=50', reader.email);
      expect(idsOf(cat)).toEqual([cards.ada.id]);
      expectAda(cat.data[0].creator);
      for (const body of [one, list, favs, cat]) expectNoLeak(body, ada);
    });

    it('search results and the review queue', async () => {
      const found = await getJson('/decks/crew/search?q=Zebracorn', reader.email);
      const hit = found.data.find((h: { item: { id: string } }) => h.item.id === cards.ada.id);
      expectAda(hit.item.creator);
      expectNoLeak(found, ada);

      const review = await getJson('/decks/crew/review', OWNER_EMAIL);
      const proposal = review.data.find(
        (r: { item: { id: string } }) => r.item.id === cards.proposal.id,
      );
      expectAda(proposal.item.creator);
    });

    it('write responses of create and patch', async () => {
      const created = await call('/decks/crew/items', ada.email, 'POST', text('Fresh'));
      expect(created.status).toBe(201);
      const body = await json(created);
      expectAda(body.creator);

      const patched = await call(`/items/${body.id}`, ada.email, 'PATCH', { title: 'Fresher' });
      expect(patched.status).toBe(200);
      expectAda((await json(patched)).creator);
    });

    it('a member with no names has name null and email-derived initials, never the email', async () => {
      const body = await getJson(`/items/${cards.quiet.id}`, reader.email);
      expect(body.creator).toEqual({
        id: quiet.id,
        name: null,
        username: null,
        initials: 'QP',
        photo: null,
      });
      expectNoLeak(body, quiet);
      expectNoLeak(await getJson('/decks/crew/items?limit=50', reader.email), quiet);
    });
  });

  describe('null, placeholder and stability', () => {
    it('is null in a personal deck', async () => {
      expect((await getJson(`/items/${cards.personal.id}`, ada.email)).creator).toBeNull();
      const list = await getJson(`/decks/${personal.slug}/items`, ada.email);
      expect(list.data[0].creator).toBeNull();
    });

    it('is the placeholder after the creator is removed, and the card still renders', async () => {
      const body = await getJson(`/items/${cards.gone.id}`, reader.email);
      expect(body.title).toBe('Orphan card');
      expect(body.creator).toEqual({
        id: null,
        name: null,
        username: null,
        initials: '',
        photo: null,
      });
      expect(idsOf(await getJson('/decks/crew/items?limit=50', reader.email))).toContain(
        cards.gone.id,
      );
    });

    it('is unchanged after another member edits, archives and restores (FR-005)', async () => {
      const card = await createItem(ctx.t.db, crew, { card: text('Stable'), createdBy: ada.id });
      const edit = await call(`/items/${card.id}`, maintainer.email, 'PATCH', { title: 'Edited' });
      expect(edit.status).toBe(200);
      expectAda((await json(edit)).creator);
      const archived = await call(`/items/${card.id}/archive`, maintainer.email, 'POST');
      expect(archived.status).toBe(200);
      expectAda((await json(archived)).creator);
      const restored = await call(`/items/${card.id}/restore`, maintainer.email, 'POST');
      expect(restored.status).toBe(200);
      expectAda((await json(restored)).creator);
      expectAda((await getJson(`/items/${card.id}`, reader.email)).creator);
    });

    it('a communal deck reader sees creators', async () => {
      expectAda((await getJson(`/items/${cards.communal.id}`, reader.email)).creator);
      expectNoLeak(await getJson('/decks/street/items', reader.email), ada);
    });
  });

  describe('category visibility hides the creator too (FR-014)', () => {
    it('a reader without the category never sees the card or its author', async () => {
      expect((await call(`/items/${cards.hidden.id}`, reader.email)).status).toBe(404);
      const bodies = [
        await getJson('/decks/crew/items?limit=50', reader.email),
        await getJson('/decks/crew/items?favorite=true&limit=50', reader.email),
        await getJson('/decks/crew/search?q=Zebracorn', reader.email),
      ];
      for (const body of bodies) {
        const s = JSON.stringify(body);
        expect(s).not.toContain(cards.hidden.id);
        expect(s).not.toContain(shadow.id);
        expect(s).not.toContain('shadow-writer');
      }
    });

    it('a reader with the category (the owner) sees it with its creator', async () => {
      const body = await getJson(`/items/${cards.hidden.id}`, OWNER_EMAIL);
      expect(body.creator).toMatchObject({ id: shadow.id, username: 'shadow-writer' });
      expectNoLeak(body, shadow);
    });
  });

  describe('payload scan (FR-006, FR-010, FR-012)', () => {
    it('members list for a non-owner reader has no location and no email of a username holder', async () => {
      const body = await getJson('/decks/crew/members', reader.email);
      const s = JSON.stringify(body);
      expect(s).not.toContain('Atlantis');
      expect(s).not.toContain(ada.email);
      expect(s).not.toContain(shadow.email);
    });

    it('public deck, items, one item and public search have no creator and no email/location', async () => {
      const paths = [
        '/public/open-street',
        '/public/open-street/items',
        `/public/open-street/items/${cards.pub.id}`,
        `/public/open-street/search?${new URLSearchParams({ q: 'Zebracorn' })}`,
      ];
      for (const path of paths) {
        const res = await anon(path);
        expect(res.status, path).toBe(200);
        const raw = await res.text();
        expect(raw, path).not.toMatch(/"creator"/);
        expectNoLeak(JSON.parse(raw), ada);
      }
      const list = await json(await anon('/public/open-street/items'));
      expect(idsOf(list)).toContain(cards.pub.id);
    });

    it('public pages, share preview and sitemap carry no creator, email or location', async () => {
      for (const path of [
        '/p/open-street',
        `/p/open-street/i/${cards.pub.id}`,
        `/s/${cards.pub.id}`,
        '/sitemap.xml',
      ]) {
        const res = await anon(path);
        expect(res.status, path).toBe(200);
        const s = await res.text();
        expect(s, path).not.toContain('Lovelace');
        expect(s, path).not.toMatch(/creator/i);
        expectNoLeak(s, ada, false);
      }
    });
  });
});
