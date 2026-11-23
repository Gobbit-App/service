import { beforeAll, describe, expect, it } from 'vitest';
import { ingestJobs, type DeckRow, type UserRow } from '@gobbit/db';
import { addMember, createAccountUser, createDeck, createItem } from '@gobbit/db/test';
import type { DeckKind } from '@gobbit/shared';
import { OWNER_EMAIL, json, setupApiTest } from './helpers';

/** 051 SC-001: no member answer carries a member's address, whatever the viewer's role or deck kind. */
describe('member email privacy (051)', () => {
  const ctx = setupApiTest();
  const users = {} as Record<'coOwner' | 'maintainer' | 'editor' | 'reader' | 'existing', UserRow>;
  let usernameInvitee: UserRow;
  /** Strings that must never appear: each address and (for our users) its distinctive local part. */
  let tokens: string[] = [];

  const mk = (local: string, username?: string) =>
    createAccountUser(ctx.t.db, { email: `${local}@example.test`, username });

  beforeAll(async () => {
    // Some with a username, some without; none has profile names (SC-002: "dana.levi" shows nowhere).
    users.coOwner = await mk('dana.levi-co');
    users.maintainer = await mk('maya.zq-main', 'maya_m');
    users.editor = await mk('eli.zq-edit');
    users.reader = await mk('rita.zq-read', 'rita_r');
    users.existing = await mk('noa.zq-existing');
    usernameInvitee = await mk('uri.zq-uname', 'uri_u');
    for (const u of [...Object.values(users), usernameInvitee]) await ctx.sessionFor(u);
    tokens = [
      OWNER_EMAIL,
      ...[...Object.values(users), usernameInvitee].map((u) => u.email.split('@')[0]!),
    ];
  });

  const ROLES = ['owner', 'coOwner', 'maintainer', 'editor', 'reader'] as const;
  type Viewer = (typeof ROLES)[number];
  const KINDS: Array<{ kind: DeckKind; viewers: readonly Viewer[] }> = [
    { kind: 'personal', viewers: ['owner'] },
    { kind: 'shared', viewers: ROLES },
    { kind: 'communal', viewers: ROLES },
  ];

  describe.each(KINDS)('$kind deck', ({ kind, viewers }) => {
    let deck: DeckRow;
    const typed: Partial<Record<Viewer, string>> = {};

    const userOf = (v: Viewer): UserRow => (v === 'owner' ? ctx.world.owner : users[v]);
    const call = async (v: Viewer, method: string, path: string, body?: unknown) =>
      ctx.app.request(path, {
        method,
        headers: ctx.as(userOf(v).email),
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    beforeAll(async () => {
      deck = await createDeck(ctx.t.db, ctx.world.owner, { kind });
      if (kind !== 'personal') {
        await addMember(ctx.t.db, deck, users.coOwner, 'owner');
        await addMember(ctx.t.db, deck, users.maintainer, 'maintainer');
        await addMember(ctx.t.db, deck, users.editor, 'editor');
        await addMember(ctx.t.db, deck, users.reader, 'reader');
      }
      // Cards, a proposal with its share job, and one reviewed share per member.
      const everyone: UserRow[] = [
        ctx.world.owner,
        ...(kind === 'personal' ? [] : Object.values(users).slice(0, 4)),
      ];
      for (const u of everyone) {
        const card = await createItem(ctx.t.db, deck, { createdBy: u.id });
        await ctx.t.db.insert(ingestJobs).values({
          userId: u.id,
          deckId: deck.id,
          channel: 'pwa',
          status: 'published',
          raw: { text: 'x', images: [] },
          resultItemId: card.id,
          reviewedBy: u.id === users.editor.id ? users.coOwner.id : users.editor.id,
          reviewedAt: ctx.clock.now(),
        });
      }
      const proposed = await createItem(ctx.t.db, deck, {
        status: 'proposed',
        createdBy: users.editor.id,
      });
      await ctx.t.db.insert(ingestJobs).values({
        userId: users.editor.id,
        deckId: deck.id,
        channel: 'pwa',
        status: 'proposed',
        raw: { text: 'x', images: [] },
        resultItemId: proposed.id,
      });
      if (kind === 'personal') return;
      // Activity log lines made through the API by each publisher/editor.
      for (const v of ['owner', 'coOwner', 'maintainer', 'editor'] as const) {
        const res = await call(v, 'POST', `/decks/${deck.id}/items`, {
          type: 'text',
          title: `by ${v}`,
          body: 'b',
        });
        expect(res.status, `create as ${v}`).toBe(201);
      }
    });

    it.each(viewers)('as %s: no answer carries a member address', async (viewer) => {
      const leaks: string[] = [];
      const allowed = new Set<string>();
      const scan = async (label: string, res: Response) => {
        expect(res.status, `${label} status`).toBeLessThan(500);
        const raw = await res.text();
        const text = raw.toLowerCase();
        for (const t of tokens) {
          if (!allowed.has(t) && text.includes(t.toLowerCase())) leaks.push(`${label} leaks ${t}`);
        }
        return text.startsWith('{') || text.startsWith('[') ? JSON.parse(raw) : null;
      };
      const get = (label: string, path: string) =>
        call(viewer, 'GET', path).then((r) => scan(label, r));
      const base = `/decks/${deck.id}`;

      if (viewer === 'owner' || viewer === 'coOwner') {
        // A typed invite to an existing user and a username invite; the typist may see what they typed.
        const address = viewer === 'owner' ? users.existing.email : `new.zq-${kind}@example.test`;
        typed[viewer] = address;
        allowed.add(address.split('@')[0]!);
        allowed.add(address);
        if (kind !== 'personal') {
          const res = await call(viewer, 'POST', `${base}/invites`, {
            email: address,
            role: 'reader',
          });
          expect(res.status, 'email invite').toBe(201);
          await scan('invite {email}', res.clone());
          expect((await json(res)).membership.email).toBe(address); // the one allowed case
        }
        if (viewer === 'owner' && kind !== 'personal') {
          const res = await call(viewer, 'POST', `${base}/invites`, {
            username: 'uri_u',
            role: 'reader',
          });
          expect(res.status, 'username invite').toBe(201);
          await scan('invite {username}', res);
        }
      } else if (kind !== 'personal') {
        await scan(
          'invite as non-inviter',
          await call(viewer, 'POST', `${base}/invites`, {
            email: 'x.zq@example.test',
            role: 'reader',
          }),
        );
      }
      const addressToken = (a?: string) => a?.split('@')[0];
      if (addressToken(typed.owner) && viewer !== 'owner') {
        // Another viewer is never the inviter of the owner's typed address.
        allowed.delete(typed.owner!.split('@')[0]!);
      }

      const members = await get('members list', `${base}/members`);
      // FR-004 and the implicit account-owner row are part of every list.
      const rows = (members?.data ?? []) as Array<{ userId: string; implicit: boolean }>;
      expect(rows.some((r) => r.userId === ctx.world.owner.id && r.implicit)).toBe(true);
      if (viewer !== 'owner') expect(rows.some((r) => r.userId === userOf(viewer).id)).toBe(true);

      if (viewer === 'owner' || viewer === 'coOwner') {
        for (const target of kind === 'personal' ? [] : [users.editor, users.reader]) {
          const res = await call(viewer, 'PATCH', `${base}/members/${target.id}`, {
            role: target === users.editor ? 'editor' : 'reader',
          });
          expect(res.status, 'role change').toBe(200);
          await scan('role change', res);
        }
      }

      await get('events', `${base}/events`);
      await get('review', `${base}/review`);
      const shares = await get('shares', `${base}/shares`);
      for (const s of (shares?.shares ?? []) as Array<{ id: string }>) {
        await get('share', `/shares/${s.id}`);
      }
      await get('items', `${base}/items`);

      expect(leaks).toEqual([]);
    });
  });

  /** 051 SC-002: a member with no names and no username is "Member" to everyone else, never "dana"/"levi"/"DL". */
  it('shows a nameless, usernameless member as "Member" with no initials, then their username', async () => {
    const dana = await createAccountUser(ctx.t.db, { email: 'dana.levi@example.test' });
    await ctx.sessionFor(dana);
    const deck = await createDeck(ctx.t.db, ctx.world.owner, { kind: 'shared' });
    await addMember(ctx.t.db, deck, dana, 'editor');
    const ownerCall = (path: string) =>
      ctx.app.request(path, { headers: ctx.as(ctx.world.owner.email) });
    // Dana's card, a proposal she shared, a share of the owner's she reviewed, and a logged change.
    await createItem(ctx.t.db, deck, { createdBy: dana.id });
    const proposed = await createItem(ctx.t.db, deck, { status: 'proposed', createdBy: dana.id });
    const base = {
      deckId: deck.id,
      channel: 'pwa' as const,
      raw: { text: 'x', images: [] },
    };
    await ctx.t.db.insert(ingestJobs).values({
      ...base,
      userId: dana.id,
      status: 'proposed',
      resultItemId: proposed.id,
    });
    const shared = await createItem(ctx.t.db, deck, { createdBy: ctx.world.owner.id });
    await ctx.t.db.insert(ingestJobs).values({
      ...base,
      userId: ctx.world.owner.id,
      status: 'published',
      resultItemId: shared.id,
      reviewedBy: dana.id,
      reviewedAt: ctx.clock.now(),
    });
    const made = await ctx.app.request(`/decks/${deck.id}/items`, {
      method: 'POST',
      headers: ctx.as(dana.email),
      body: JSON.stringify({ type: 'text', title: 'a new card', body: 'b' }),
    });
    expect(made.status).toBe(201);

    const read = async () => {
      const bodies = {
        members: await json(await ownerCall(`/decks/${deck.id}/members`)),
        events: await json(await ownerCall(`/decks/${deck.id}/events`)),
        review: await json(await ownerCall(`/decks/${deck.id}/review`)),
        shares: await json(await ownerCall(`/decks/${deck.id}/shares`)),
        items: await json(await ownerCall(`/decks/${deck.id}/items`)),
      };
      const text = JSON.stringify(bodies);
      const pick = <T extends { userId?: string; id?: string }>(l: T[] = [], k: 'userId' | 'id') =>
        l.find((x) => x[k] === dana.id);
      const row = pick<any>(bodies.members.data, 'userId');
      const actor = bodies.events.data.find((e: any) => e.actor?.userId === dana.id)?.actor;
      const sharedBy = bodies.review.data?.find((r: any) => r.job.sharedBy?.id === dana.id)?.job
        .sharedBy;
      const reviewedBy = bodies.shares.shares?.find(
        (s: any) => s.reviewedBy?.id === dana.id,
      )?.reviewedBy;
      const creator = bodies.items.data?.find((i: any) => i.creator?.id === dana.id)?.creator;
      return { text, row, actor, sharedBy, reviewedBy, creator };
    };

    const before = await read();
    for (const [k, v] of Object.entries({
      row: before.row,
      actor: before.actor,
      sharedBy: before.sharedBy,
      reviewedBy: before.reviewedBy,
      creator: before.creator,
    })) {
      expect(v, `${k} present`).toBeDefined();
      expect(v.initials, `${k} initials`).toBe('');
      if (k !== 'creator') expect(v.displayName, `${k} name`).toBe('Member');
      else expect(v.name, 'creator name').toBeNull(); // cards show the avatar label "Member" (D422)
    }
    expect(before.text).not.toMatch(/dana|levi|"DL"/i);

    const patched = await ctx.app.request('/me/profile', {
      method: 'PATCH',
      headers: ctx.as(dana.email),
      body: JSON.stringify({ username: 'kestrel_fox' }),
    });
    expect(patched.status).toBe(200);
    const after = await read();
    for (const v of [after.row, after.actor, after.sharedBy, after.reviewedBy]) {
      expect(v.displayName).toBe('kestrel_fox');
      expect(v.initials).toBe('KF');
    }
    expect(after.creator).toMatchObject({ username: 'kestrel_fox', initials: 'KF' });
    expect(after.text).not.toMatch(/dana|levi/i);
  });

  /** US3 (051): who sees a pending invite's address (D461), its profile (D462) and its inviter (D463). */
  describe('pending invites', () => {
    type Who = 'owner' | 'coOwner' | 'maintainer' | 'editor' | 'reader';
    const WHO: Who[] = ['owner', 'coOwner', 'maintainer', 'editor', 'reader'];
    const userOf = (v: Who): UserRow => (v === 'owner' ? ctx.world.owner : users[v]);
    const call = (v: Who, method: string, path: string, body?: unknown) =>
      ctx.app.request(path, {
        method,
        headers: ctx.as(userOf(v).email),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let seq = 0;
    const newDeck = async () => {
      const deck = await createDeck(ctx.t.db, ctx.world.owner, { kind: 'shared' });
      await addMember(ctx.t.db, deck, users.coOwner, 'owner');
      await addMember(ctx.t.db, deck, users.maintainer, 'maintainer');
      await addMember(ctx.t.db, deck, users.editor, 'editor');
      await addMember(ctx.t.db, deck, users.reader, 'reader');
      return deck;
    };
    const invite = (deck: DeckRow, as: Who, body: object) =>
      call(as, 'POST', `/decks/${deck.id}/invites`, { role: 'reader', ...body });
    const row = async (deck: DeckRow, as: Who, userId: string) => {
      const res = await call(as, 'GET', `/decks/${deck.id}/members`);
      expect(res.status).toBe(200);
      const found = ((await json(res)).data as Array<Record<string, any>>).find(
        (r) => r.userId === userId,
      );
      expect(found, `${as} sees the row`).toBeDefined();
      return found!;
    };
    const accept = (deck: DeckRow, userId: string) =>
      ctx.t.pool.query(
        'UPDATE memberships SET accepted_at = now() WHERE deck_id = $1 AND user_id = $2',
        [deck.id, userId],
      );
    const addr = () => `pend${++seq}.zq@example.test`;

    // T025
    it('only the inviter sees the typed address on the pending row; none after accept', async () => {
      const deck = await newDeck();
      const email = addr();
      const res = await invite(deck, 'owner', { email });
      expect(res.status).toBe(201);
      const { userId } = (await json(res)).membership;
      for (const v of WHO) {
        expect((await row(deck, v, userId)).email, v).toBe(v === 'owner' ? email : null);
      }
      await accept(deck, userId);
      for (const v of WHO) {
        const r = await row(deck, v, userId);
        expect(r.email, `after accept, ${v}`).toBeNull();
        expect(r.acceptedAt).not.toBeNull();
      }
    });

    it('a re-invite by the co-owner by address moves the address to the co-owner', async () => {
      const deck = await newDeck();
      const email = addr();
      const { userId } = (await json(await invite(deck, 'owner', { email }))).membership;
      expect((await invite(deck, 'coOwner', { email })).status).toBe(200);
      expect((await row(deck, 'coOwner', userId)).email).toBe(email);
      expect((await row(deck, 'owner', userId)).email).toBeNull();
    });

    it('a re-invite by username clears the address for everyone', async () => {
      const deck = await newDeck();
      const first = await invite(deck, 'owner', { email: usernameInvitee.email });
      expect(first.status).toBe(201);
      expect((await row(deck, 'owner', usernameInvitee.id)).email).toBe(usernameInvitee.email);
      expect((await invite(deck, 'owner', { username: 'uri_u' })).status).toBe(200);
      for (const v of WHO) {
        expect((await row(deck, v, usernameInvitee.id)).email, v).toBeNull();
      }
    });

    it('a demoted inviter still sees the address', async () => {
      const deck = await newDeck();
      const email = addr();
      const { userId } = (await json(await invite(deck, 'coOwner', { email }))).membership;
      const patched = await call(
        'owner',
        'PATCH',
        `/decks/${deck.id}/members/${users.coOwner.id}`,
        {
          role: 'maintainer',
        },
      );
      expect(patched.status).toBe(200);
      expect((await row(deck, 'coOwner', userId)).email).toBe(email);
    });

    it('a pending invite created before the flag shows no address', async () => {
      const deck = await newDeck();
      const invitee = await createAccountUser(ctx.t.db, { email: addr() });
      // invited_by_email defaults to false: the shape of every row that predates the flag.
      await addMember(ctx.t.db, deck, invitee, 'reader', {
        invitedBy: ctx.world.owner.id,
        acceptedAt: null,
      });
      for (const v of WHO) expect((await row(deck, v, invitee.id)).email, v).toBeNull();
    });

    // T026
    it('a pending typed-address invite is anonymous to everyone, then shows the profile', async () => {
      const deck = await newDeck();
      const existing = await createAccountUser(ctx.t.db, {
        email: addr(),
        firstName: 'Ivy',
        lastName: 'Zq',
        username: 'ivy_zq',
        avatar: { publicId: 'gobbit/avatars/test/ivy', width: 10, height: 10 },
      });
      const res = await invite(deck, 'owner', { email: existing.email });
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.membership.displayName).toBe('Member');
      expect(JSON.stringify(body)).not.toMatch(/ivy/i);
      for (const v of WHO) {
        expect(await row(deck, v, existing.id), v).toMatchObject({
          displayName: 'Member',
          username: null,
          initials: '',
          photo: null,
        });
      }
      await accept(deck, existing.id);
      expect(await row(deck, 'reader', existing.id)).toMatchObject({
        displayName: 'Ivy Zq',
        username: 'ivy_zq',
        initials: 'IZ',
        photo: { publicId: 'gobbit/avatars/test/ivy' },
      });
    });

    it('a pending {username} invite keeps the summary', async () => {
      const deck = await newDeck();
      expect((await invite(deck, 'owner', { username: 'uri_u' })).status).toBe(201);
      for (const v of WHO) {
        expect(await row(deck, v, usernameInvitee.id), v).toMatchObject({
          displayName: 'uri_u',
          username: 'uri_u',
          email: null,
        });
      }
    });

    // T027
    describe('invitedBy (D463)', () => {
      let inviter: UserRow;
      beforeAll(async () => {
        inviter = await createAccountUser(ctx.t.db, {
          email: 'ina.zq-inviter@example.test',
          username: 'ina_inviter',
        });
        await ctx.sessionFor(inviter);
      });
      const setup = async () => {
        const deck = await newDeck();
        await addMember(ctx.t.db, deck, inviter, 'owner');
        const res = await ctx.app.request(`/decks/${deck.id}/invites`, {
          method: 'POST',
          headers: ctx.as(inviter.email),
          body: JSON.stringify({ email: addr(), role: 'reader' }),
        });
        expect(res.status).toBe(201);
        return { deck, userId: (await json(res)).membership.userId as string };
      };

      it('shows the inviter name to owners only; null to others and on accepted rows', async () => {
        const { deck, userId } = await setup();
        for (const v of WHO) {
          const expected = v === 'owner' || v === 'coOwner' ? 'ina_inviter' : null;
          expect((await row(deck, v, userId)).invitedBy, v).toBe(expected);
        }
        await accept(deck, userId);
        for (const v of WHO) expect((await row(deck, v, userId)).invitedBy, v).toBeNull();
      });

      it('is "Member" once the inviter is removed from the deck', async () => {
        const { deck, userId } = await setup();
        const res = await call('owner', 'DELETE', `/decks/${deck.id}/members/${inviter.id}`);
        expect(res.status).toBe(204);
        expect((await row(deck, 'owner', userId)).invitedBy).toBe('Member');
      });

      it('is "Member" when the inviter account is gone (invited_by null)', async () => {
        const { deck, userId } = await setup();
        await ctx.t.pool.query(
          'UPDATE memberships SET invited_by = NULL WHERE deck_id = $1 AND user_id = $2',
          [deck.id, userId],
        );
        expect((await row(deck, 'coOwner', userId)).invitedBy).toBe('Member');
      });
    });
  });
});
