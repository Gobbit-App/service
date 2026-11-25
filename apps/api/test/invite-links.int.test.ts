import { beforeAll, describe, expect, it } from 'vitest';
import type { DeckRow, UserRow } from '@gobbit/db';
import { sha256Hex } from '@gobbit/db';
import {
  addMember,
  createAccountUser,
  createCategory,
  createDeck,
  createItem,
} from '@gobbit/db/test';
import { createAnonRateLimiter } from '../src/lib/anon-rate-limiter';
import { captureLogger } from './capture-logger';
import { json, setupApiTest } from './helpers';

/** 052: owner routes for invite links. */
describe('invite links, owner routes (052)', () => {
  const ctx = setupApiTest({ env: { INVITE_LINKS_WAITING_MAX: '2' } });
  let editor: UserRow;
  let maintainer: UserRow;

  beforeAll(async () => {
    editor = await createAccountUser(ctx.t.db);
    maintainer = await createAccountUser(ctx.t.db);
    for (const u of [editor, maintainer]) await ctx.sessionFor(u);
  });

  const deckWithMembers = async (): Promise<DeckRow> => {
    const deck = await createDeck(ctx.t.db, ctx.world.owner);
    await addMember(ctx.t.db, deck, editor, 'editor');
    await addMember(ctx.t.db, deck, maintainer, 'maintainer');
    return deck;
  };
  const create = (deck: string, body: object, email?: string) =>
    ctx.app.request(`/decks/${deck}/invite-links`, {
      method: 'POST',
      headers: ctx.as(email),
      body: JSON.stringify(body),
    });
  const list = (deck: string, email?: string) =>
    ctx.app.request(`/decks/${deck}/invite-links`, { headers: ctx.as(email) });

  it('owner creates a waiting link, and list returns the same url (FR-003, FR-015)', async () => {
    const deck = await deckWithMembers();
    const res = await create(deck.id, { name: 'Cousins', role: 'reader' });
    expect(res.status).toBe(201);
    const made = await json(res);
    expect(made).toMatchObject({ name: 'Cousins', role: 'reader', state: 'waiting' });
    expect(made.url).toContain('?t=');
    expect(JSON.stringify(made)).not.toContain('@');

    const listed = await list(deck.id);
    expect(listed.status).toBe(200);
    const body = await json(listed);
    expect(body.links.find((l: { id: string }) => l.id === made.id).url).toBe(made.url);
    expect(JSON.stringify(body)).not.toContain('@');
  });

  it('parallel creates past the cap: exactly max succeed (FR-004)', async () => {
    const deck = await deckWithMembers();
    const res = await Promise.all(
      [1, 2, 3, 4].map((i) => create(deck.id, { name: `p${i}`, role: 'reader' })),
    );
    expect(res.filter((r) => r.status === 201)).toHaveLength(2);
    expect(res.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it('editor and maintainer cannot create or list (FR-013)', async () => {
    const deck = await deckWithMembers();
    for (const u of [editor, maintainer]) {
      expect((await create(deck.id, { name: 'x', role: 'reader' }, u.email)).status).toBe(403);
      expect((await list(deck.id, u.email)).status).toBe(403);
    }
  });

  it('refuses a personal deck with 409 invite_link_personal', async () => {
    const personal = await createDeck(ctx.t.db, ctx.world.owner, { isDefault: true });
    const res = await create(personal.id, { name: 'x', role: 'reader' });
    expect(res.status).toBe(409);
    expect((await json(res)).type).toBe('/problems/invite-link-personal');
  });

  it('refuses role owner with 400', async () => {
    const deck = await deckWithMembers();
    expect((await create(deck.id, { name: 'x', role: 'owner' })).status).toBe(400);
  });

  it('caps waiting links: third is 409 invite_link_limit (FR-004)', async () => {
    const deck = await deckWithMembers();
    expect((await create(deck.id, { name: 'a', role: 'reader' })).status).toBe(201);
    expect((await create(deck.id, { name: 'b', role: 'editor' })).status).toBe(201);
    const res = await create(deck.id, { name: 'c', role: 'reader' });
    expect(res.status).toBe(409);
    const problem = await json(res);
    expect(problem.type).toBe('/problems/invite-link-limit');
    expect(JSON.stringify(problem)).not.toContain('@');
  });
});

/** 052: anonymous preview, the OG page and Join. */
describe('invite links, preview and join (052)', () => {
  const IP_HEADER = 'x-test-client-ip';
  const cap = captureLogger();
  const ctx = setupApiTest({
    env: { CLIENT_IP_HEADER: IP_HEADER },
    anonLimiter: createAnonRateLimiter({ limit: 1000 }),
    logger: cap.logger,
  });
  const limited = setupApiTest({
    env: { CLIENT_IP_HEADER: IP_HEADER },
    anonLimiter: createAnonRateLimiter({ limit: 2 }),
  });
  let joiner: UserRow;
  let joiner2: UserRow;

  beforeAll(async () => {
    joiner = await createAccountUser(ctx.t.db);
    joiner2 = await createAccountUser(ctx.t.db);
    for (const u of [joiner, joiner2]) await ctx.sessionFor(u);
  });

  const meta = (html: string, p: string) =>
    new RegExp(`<meta property="${p}" content="([^"]*)"`).exec(html)?.[1];
  const tokenOf = (url: string) => new URL(url).searchParams.get('t')!;

  async function makeLink(role = 'editor') {
    const deck = await createDeck(ctx.t.db, ctx.world.owner, { name: 'Cousins Deck' });
    const res = await ctx.app.request(`/decks/${deck.id}/invite-links`, {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ name: 'Reference Name', role }),
    });
    const link = await json(res);
    return { deck, link, token: tokenOf(link.url) };
  }
  const preview = (token: string, headers: Record<string, string> = ctx.anon()) =>
    ctx.app.request(`/invites/preview?t=${token}`, { headers });
  const accept = (token: string, email?: string) =>
    ctx.app.request('/invite-links/accept', {
      method: 'POST',
      headers: email ? ctx.as(email) : ctx.anon(),
      body: JSON.stringify({ token }),
    });
  const count = async (table: string) =>
    Number((await ctx.t.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

  it('preview ignores credentials; unknown token is 200 invalid (D470)', async () => {
    const { token } = await makeLink('reader');
    const signedOut = await json(await preview(token));
    const signedIn = await json(await preview(token, ctx.as(joiner.email)));
    expect(signedOut).toMatchObject({ state: 'waiting', deckName: 'Cousins Deck', role: 'reader' });
    expect(signedIn).toEqual(signedOut);
    const miss = await preview('nope-nope');
    expect(miss.status).toBe(200);
    expect(await json(miss)).toEqual({ state: 'invalid' });
  });

  it('GET /s/invite serves the OG page for a waiting link and a generic one otherwise', async () => {
    const { token } = await makeLink('reader');
    const res = await ctx.app.request(`/s/invite?t=${token}`, { headers: ctx.anon() });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/html/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Robots-Tag')).toMatch(/noindex/);
    const html = await res.text();
    expect(meta(html, 'og:title')).toBe('Join Cousins Deck on Gobbit');
    expect(meta(html, 'og:description')).toMatch(/invited you as/);
    expect(meta(html, 'og:image')).toMatch(/\/og\/private\.png$/);
    expect(html).toContain(`/join?t=${token}`);

    for (const url of ['/s/invite?t=unknown-token', '/s/invite']) {
      const generic = await (await ctx.app.request(url, { headers: ctx.anon() })).text();
      expect(meta(generic, 'og:title')).toBe('A Gobbit invite');
      expect(meta(generic, 'og:description')).toBe('Open it in Gobbit');
    }
  });

  it('GET /s/invite answers 429 HTML past the per-IP limit', async () => {
    const hit = () =>
      limited.app.request('/s/invite?t=x', {
        headers: { ...limited.anon(), [IP_HEADER]: '10.9.0.1' },
      });
    await hit();
    await hit();
    const res = await hit();
    expect(res.status).toBe(429);
    expect(res.headers.get('Content-Type')).toMatch(/text\/html/);
  });

  it('shows nothing about cards, categories, the reference name or addresses (FR-006)', async () => {
    const { deck, token } = await makeLink();
    const cat = await createCategory(ctx.t.db, deck, {
      name: 'Secret Category',
      visibility: 'private',
    });
    await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'Secret Card Title', payload: {} },
      categoryIds: [cat.id],
    });
    const bodies = [
      await (await preview(token)).text(),
      await (await ctx.app.request(`/s/invite?t=${token}`, { headers: ctx.anon() })).text(),
    ];
    for (const b of bodies) {
      for (const s of ['Secret Card Title', 'Secret Category', 'Reference Name', '@']) {
        expect(b).not.toContain(s);
      }
    }
  });

  it('opening a link changes no sessions, users or memberships rows (FR-005)', async () => {
    const { token } = await makeLink();
    const before = [await count('sessions'), await count('users'), await count('memberships')];
    await preview(token);
    await ctx.app.request(`/s/invite?t=${token}`, { headers: ctx.anon() });
    const after = [await count('sessions'), await count('users'), await count('memberships')];
    expect(after).toEqual(before);
  });

  it('Join gives the link role; signed out is 401', async () => {
    const { deck, token } = await makeLink('editor');
    expect((await accept(token)).status).toBe(401);
    const res = await accept(token, joiner.email);
    expect(res.status).toBe(200);
    expect((await json(res)).deck).toMatchObject({ id: deck.id, slug: deck.slug, name: deck.name });
    const { rows } = await ctx.t.pool.query(
      'SELECT role, accepted_at FROM memberships WHERE deck_id = $1 AND user_id = $2',
      [deck.id, joiner.id],
    );
    expect(rows[0].role).toBe('editor');
    expect(rows[0].accepted_at).not.toBeNull();
    expect((await json(await preview(token))).state).toBe('used');
  });

  it('two parallel accepts: exactly one 200, one 409 invite_link_used (FR-008)', async () => {
    const { token } = await makeLink();
    const [a, b] = await Promise.all([accept(token, joiner.email), accept(token, joiner2.email)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = await json(a.status === 409 ? a : b);
    expect(loser.type).toBe('/problems/invite-link-used');
  });

  it('same person on two waiting links of one deck in parallel: no 500, one membership', async () => {
    const { deck, token } = await makeLink();
    const second = await json(
      await ctx.app.request(`/decks/${deck.id}/invite-links`, {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ name: 'Second', role: 'reader' }),
      }),
    );
    const res = await Promise.all([
      accept(token, joiner.email),
      accept(tokenOf(second.url), joiner.email),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = await json(res.find((r) => r.status === 409)!);
    expect(loser.type).toBe('/problems/invite-link-already-member');
    const rows = await ctx.t.pool.query(
      'SELECT 1 FROM memberships WHERE deck_id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [deck.id, joiner.id],
    );
    expect(rows.rowCount).toBe(1);
  });

  it('retry of an accepted link by the same person is 409 already_member, not used', async () => {
    const { deck, token } = await makeLink();
    expect((await accept(token, joiner.email)).status).toBe(200);
    const again = await accept(token, joiner.email);
    expect(again.status).toBe(409);
    const problem = await json(again);
    expect(problem.type).toBe('/problems/invite-link-already-member');
    expect(problem.deck).toEqual({ slug: deck.slug });
  });

  it('already a member: 409 invite_link_already_member with deck.slug; link stays waiting (FR-010)', async () => {
    const { deck, token } = await makeLink();
    await addMember(ctx.t.db, deck, joiner, 'reader');
    const res = await accept(token, joiner.email);
    expect(res.status).toBe(409);
    const problem = await json(res);
    expect(problem.type).toBe('/problems/invite-link-already-member');
    expect(problem.deck).toEqual({ slug: deck.slug });
    expect((await json(await preview(token))).state).toBe('waiting');
  });

  it('a pending mailed invite is accepted with the link role and its mailed links expire', async () => {
    const { deck, token } = await makeLink('maintainer');
    const pending = await addMember(ctx.t.db, deck, joiner, 'reader', { acceptedAt: null });
    await ctx.t.pool.query(
      `INSERT INTO magic_links (email, token_hash, purpose, membership_id, expires_at)
       VALUES ($1, $2, 'invite', $3, now() + interval '7 days')`,
      [joiner.email, sha256Hex('mailed-' + pending.id), pending.id],
    );
    expect((await accept(token, joiner.email)).status).toBe(200);
    const m = await ctx.t.pool.query('SELECT role, accepted_at FROM memberships WHERE id = $1', [
      pending.id,
    ]);
    expect(m.rows[0].role).toBe('maintainer');
    expect(m.rows[0].accepted_at).not.toBeNull();
    const ml = await ctx.t.pool.query(
      'SELECT expires_at <= now() AS gone FROM magic_links WHERE membership_id = $1',
      [pending.id],
    );
    expect(ml.rows[0].gone).toBe(true);
  });

  it('no request or error log line contains the token (D468)', async () => {
    const { token } = await makeLink();
    await preview(token);
    await ctx.app.request(`/s/invite?t=${token}`, { headers: ctx.anon() });
    await accept(token, joiner.email);
    await accept(token, joiner.email);
    await cap.flush();
    expect(cap.lines.length).toBeGreaterThan(0);
    expect(JSON.stringify(cap.lines)).not.toContain(token);
  });
});

/** 052: revoking and the other ways a link stops (US3). */
describe('invite links, revoke and stopping (052)', () => {
  const ctx = setupApiTest({
    env: { CLIENT_IP_HEADER: 'x-test-client-ip' },
    anonLimiter: createAnonRateLimiter({ limit: 1000 }),
  });
  let editor: UserRow;
  let coOwner: UserRow;
  let joiner: UserRow;

  beforeAll(async () => {
    editor = await createAccountUser(ctx.t.db);
    coOwner = await createAccountUser(ctx.t.db);
    joiner = await createAccountUser(ctx.t.db);
    for (const u of [editor, coOwner, joiner]) await ctx.sessionFor(u);
  });

  const tokenOf = (url: string) => new URL(url).searchParams.get('t')!;
  const sql = (q: string, v: unknown[]) => ctx.t.pool.query(q, v);

  async function makeLink(opts: { creator?: UserRow; role?: string } = {}) {
    const deck = await createDeck(ctx.t.db, ctx.world.owner, { name: 'Stopping Deck' });
    await addMember(ctx.t.db, deck, editor, 'editor');
    if (opts.creator) await addMember(ctx.t.db, deck, opts.creator, 'owner');
    const res = await ctx.app.request(`/decks/${deck.id}/invite-links`, {
      method: 'POST',
      headers: ctx.as(opts.creator?.email),
      body: JSON.stringify({ name: 'Ref', role: opts.role ?? 'reader' }),
    });
    const link = await json(res);
    return { deck, link, token: tokenOf(link.url) };
  }
  const revoke = (deckId: string, linkId: string, email?: string) =>
    ctx.app.request(`/decks/${deckId}/invite-links/${linkId}`, {
      method: 'DELETE',
      headers: ctx.as(email),
    });
  const list = async (deckId: string) =>
    (await json(await ctx.app.request(`/decks/${deckId}/invite-links`, { headers: ctx.as() })))
      .links as { id: string; state: string; url: string | null; acceptedBy: unknown }[];
  const preview = async (token: string) =>
    (await json(await ctx.app.request(`/invites/preview?t=${token}`, { headers: ctx.anon() })))
      .state;
  const accept = (token: string) =>
    ctx.app.request('/invite-links/accept', {
      method: 'POST',
      headers: ctx.as(joiner.email),
      body: JSON.stringify({ token }),
    });

  it('owner revokes (204, revoked_by set); a second revoke is 409 not_waiting', async () => {
    const { deck, link, token } = await makeLink();
    expect((await revoke(deck.id, link.id)).status).toBe(204);
    const { rows } = await sql(
      'SELECT revoked_at, revoked_by FROM deck_invite_links WHERE id = $1',
      [link.id],
    );
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[0].revoked_by).toBe(ctx.world.owner.id);
    expect(await preview(token)).toBe('revoked');
    const again = await revoke(deck.id, link.id);
    expect(again.status).toBe(409);
    expect((await json(again)).type).toBe('/problems/not-waiting');
  });

  it('an accepted link cannot be revoked (409); editor is 403; another deck is 404 (FR-014)', async () => {
    const { deck, link, token } = await makeLink();
    expect((await accept(token)).status).toBe(200);
    expect((await revoke(deck.id, link.id)).status).toBe(409);

    const other = await makeLink();
    expect((await revoke(other.deck.id, other.link.id, editor.email)).status).toBe(403);
    expect((await revoke(other.deck.id, link.id)).status).toBe(404);
  });

  it.each([
    [
      'revoked',
      'revoked',
      (d: DeckRow, id: string) =>
        sql('UPDATE deck_invite_links SET revoked_at = now() WHERE id = $1', [id]),
    ],
    [
      'expired',
      'expired',
      (d: DeckRow, id: string) =>
        sql("UPDATE deck_invite_links SET expires_at = now() - interval '1 minute' WHERE id = $1", [
          id,
        ]),
    ],
  ])('a %s link previews and accepts as %s (FR-009)', async (_n, state, stop) => {
    const { deck, link, token } = await makeLink();
    await stop(deck, link.id);
    expect(await preview(token)).toBe(state);
    const res = await accept(token);
    expect(res.status).toBe(409);
    expect((await json(res)).type).toBe(`/problems/invite-link-${state}`);
  });

  it.each([
    [
      'creator demoted to editor',
      (d: DeckRow, c: UserRow) =>
        sql("UPDATE memberships SET role = 'editor' WHERE deck_id = $1 AND user_id = $2", [
          d.id,
          c.id,
        ]),
    ],
    [
      'creator deleted',
      (_d: DeckRow, c: UserRow) => sql('UPDATE users SET deleted_at = now() WHERE id = $1', [c.id]),
    ],
    [
      'deck deleted',
      (d: DeckRow) => sql('UPDATE decks SET deleted_at = now() WHERE id = $1', [d.id]),
    ],
  ])('%s: preview and accept say invalid (D473)', async (_n, stop) => {
    const creator = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(creator);
    const { deck, token } = await makeLink({ creator });
    await stop(deck, creator);
    expect(await preview(token)).toBe('invalid');
    const res = await accept(token);
    expect(res.status).toBe(409);
    expect((await json(res)).type).toBe('/problems/invite-link-invalid');
  });

  it('list shows who joined without an address; a demoted creator is invalid, has no url, can be revoked', async () => {
    const { deck, link, token } = await makeLink();
    await accept(token);
    const rows = await list(deck.id);
    const done = rows.find((r) => r.id === link.id)!;
    expect(done.state).toBe('accepted');
    expect(done.acceptedBy).toMatchObject({ id: joiner.id });
    expect(JSON.stringify(rows)).not.toContain('@');

    const creator = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(creator);
    const made = await makeLink({ creator });
    await sql("UPDATE memberships SET role = 'editor' WHERE deck_id = $1 AND user_id = $2", [
      made.deck.id,
      creator.id,
    ]);
    const bad = (await list(made.deck.id)).find((r) => r.id === made.link.id)!;
    expect(bad.state).toBe('invalid');
    expect(bad.url).toBeNull();
    expect((await revoke(made.deck.id, made.link.id)).status).toBe(204);
  });

  it('drops links that ended more than INVITE_TTL_DAYS ago (D476)', async () => {
    const { deck, link } = await makeLink();
    await revoke(deck.id, link.id);
    expect((await list(deck.id)).some((r) => r.id === link.id)).toBe(true);
    await sql("UPDATE deck_invite_links SET revoked_at = now() - interval '8 days' WHERE id = $1", [
      link.id,
    ]);
    expect((await list(deck.id)).some((r) => r.id === link.id)).toBe(false);
  });

  it('a member who joined by link can have their role changed and be removed (FR-017)', async () => {
    const { deck, token } = await makeLink();
    await accept(token);
    const url = `/decks/${deck.id}/members/${joiner.id}`;
    const patch = await ctx.app.request(url, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({ role: 'editor' }),
    });
    expect(patch.status).toBe(200);
    expect((await json(patch)).role).toBe('editor');
    expect((await ctx.app.request(url, { method: 'DELETE', headers: ctx.as() })).status).toBe(204);
  });
});
