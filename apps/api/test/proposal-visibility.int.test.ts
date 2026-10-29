import { beforeAll, describe, expect, it } from 'vitest';
import type { ItemRow, UserRow } from '@gobbit/db';
import { addMember, createAccountUser, createItem } from '@gobbit/db/test';
import { json, OWNER_EMAIL, setupApiTest } from './helpers';

describe('proposal visibility (D96)', () => {
  const ctx = setupApiTest();
  let reader: UserRow;
  let editor: UserRow;
  let maintainer: UserRow;
  let ownersProposal: ItemRow;
  let editorsProposal: ItemRow;

  beforeAll(async () => {
    const { family } = ctx.world.decks;
    reader = await createAccountUser(ctx.t.db);
    editor = await createAccountUser(ctx.t.db);
    maintainer = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, family, reader, 'reader');
    await addMember(ctx.t.db, family, editor, 'editor');
    await addMember(ctx.t.db, family, maintainer, 'maintainer');
    for (const u of [reader, editor, maintainer]) await ctx.sessionFor(u);

    ownersProposal = await createItem(ctx.t.db, family, {
      card: { type: 'text', title: 'Owner proposal', payload: {} },
      status: 'proposed',
      createdBy: ctx.world.owner.id,
    });
    editorsProposal = await createItem(ctx.t.db, family, {
      card: { type: 'text', title: 'Editor proposal', payload: {} },
      status: 'proposed',
      createdBy: editor.id,
    });
  });

  const get = (path: string, email: string) => ctx.app.request(path, { headers: ctx.as(email) });
  const patch = (path: string, email: string, body: unknown) =>
    ctx.app.request(path, { method: 'PATCH', headers: ctx.as(email), body: JSON.stringify(body) });

  it('a reader cannot list proposals (403)', async () => {
    const res = await get('/decks/family/items?status=proposed', reader.email);
    expect(res.status).toBe(403);
  });

  it('an editor cannot list proposals (403)', async () => {
    const res = await get('/decks/family/items?status=proposed', editor.email);
    expect(res.status).toBe(403);
  });

  it('publishers (owner, maintainer) list proposals', async () => {
    for (const email of [OWNER_EMAIL, maintainer.email]) {
      const res = await get('/decks/family/items?status=proposed', email);
      expect(res.status).toBe(200);
      const ids = (await json(res)).data.map((i: { id: string }) => i.id);
      expect(ids).toEqual(expect.arrayContaining([ownersProposal.id, editorsProposal.id]));
    }
  });

  it('a reader gets 404 for a proposal', async () => {
    expect((await get(`/items/${ownersProposal.id}`, reader.email)).status).toBe(404);
  });

  it('an editor sees their own proposal but not someone else’s', async () => {
    expect((await get(`/items/${editorsProposal.id}`, editor.email)).status).toBe(200);
    expect((await get(`/items/${ownersProposal.id}`, editor.email)).status).toBe(404);
  });

  it('an editor cannot edit someone else’s proposal (404)', async () => {
    const res = await patch(`/items/${ownersProposal.id}`, editor.email, { title: 'Hijack' });
    expect(res.status).toBe(404);
  });

  it('a maintainer reads any proposal', async () => {
    expect((await get(`/items/${editorsProposal.id}`, maintainer.email)).status).toBe(200);
  });

  it('the creator edits their own proposal and it stays proposed (editor round trip)', async () => {
    const res = await patch(`/items/${editorsProposal.id}`, editor.email, {
      title: 'Editor proposal, edited',
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ title: 'Editor proposal, edited', status: 'proposed' });
  });

  it('a publisher edits a proposal and it stays proposed', async () => {
    const res = await patch(`/items/${editorsProposal.id}`, maintainer.email, {
      body: 'Tidied by a maintainer',
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ body: 'Tidied by a maintainer', status: 'proposed' });
  });
});
