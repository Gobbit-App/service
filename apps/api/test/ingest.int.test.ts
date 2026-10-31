import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { assets, ingestJobs, type UserRow } from '@gobbit/db';
import { addMember, createAccountUser } from '@gobbit/db/test';
import type { IngestQueue } from '../src/jobs/ingest-queue';
import { MemoryIngestUploads } from '../src/media/ingest-uploads';
import { json, OTHER_EMAIL, setupApiTest } from './helpers';

class RecordingQueue implements IngestQueue {
  readonly ids: string[] = [];
  async enqueue(jobId: string): Promise<void> {
    this.ids.push(jobId);
  }
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function imageFile(
  name = 'shot.png',
  type = 'image/png',
  bytes: Uint8Array<ArrayBuffer> = PNG,
): File {
  return new File([bytes], name, { type });
}

describe('POST /ingest + GET /ingest/{id} (D93, D101, D109, D110)', () => {
  const queue = new RecordingQueue();
  const uploads = new MemoryIngestUploads();
  const ctx = setupApiTest({
    env: { INGEST_DAILY_CAP: '3' },
    ingest: { enabled: true, uploads, queue },
  });
  let reader: UserRow;
  let editor: UserRow;
  let capped: UserRow;

  beforeAll(async () => {
    const { family } = ctx.world.decks;
    reader = await createAccountUser(ctx.t.db);
    editor = await createAccountUser(ctx.t.db);
    capped = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, family, reader, 'reader');
    await addMember(ctx.t.db, family, editor, 'editor');
    await addMember(ctx.t.db, family, capped, 'editor');
    for (const u of [reader, editor, capped]) await ctx.sessionFor(u);
  });

  const postJson = (body: unknown, email?: string) =>
    ctx.app.request('/ingest', {
      method: 'POST',
      headers: ctx.as(email),
      body: JSON.stringify(body),
    });

  const postForm = (form: FormData, email?: string) => {
    const { Authorization } = ctx.as(email);
    return ctx.app.request('/ingest', { method: 'POST', headers: { Authorization }, body: form });
  };

  const jobRow = async (id: string) =>
    (await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, id)))[0];

  it('accepts a JSON share (202), stores a queued job and enqueues it', async () => {
    const res = await postJson(
      { deckId: 'family', text: 'Plumber Dan 050-1234567', url: 'https://example.com/dan' },
      editor.email,
    );
    expect(res.status).toBe(202);
    const body = await json(res);
    expect(body.status).toBe('queued');
    expect(queue.ids).toContain(body.id);

    const row = await jobRow(body.id);
    expect(row.deckId).toBe(ctx.world.decks.family.id);
    expect(row.userId).toBe(editor.id);
    expect(row.channel).toBe('paste');
    expect(row.status).toBe('queued');
    expect(row.raw).toEqual({
      text: 'Plumber Dan 050-1234567',
      url: 'https://example.com/dan',
      images: [],
    });
  });

  it('accepts a multipart share with images and uploads them under the job tag', async () => {
    const form = new FormData();
    form.set('deckId', 'family');
    form.set('title', '');
    form.set('channel', 'pwa');
    form.append('files', imageFile('a.png'));
    form.append('files', imageFile('b.jpg', 'image/jpeg'));
    const res = await postForm(form, editor.email);
    expect(res.status).toBe(202);
    const { id } = await json(res);

    const row = await jobRow(id);
    expect(row.channel).toBe('pwa');
    expect(row.raw?.title).toBeUndefined();
    expect(row.raw?.images).toHaveLength(2);
    expect(row.raw?.images[0]).toMatchObject({ bytes: PNG.byteLength, mime: 'image/png' });
    expect(row.raw?.images[0].publicId).toMatch(
      new RegExp(`^gobbit/ingest/${ctx.world.decks.family.id}/`),
    );
    expect([...uploads.uploads.values()].filter((u) => u.jobId === id)).toHaveLength(2);

    // D157: each ingest upload is recorded as an asset of the deck, with its dimensions.
    const [recorded] = await ctx.t.db
      .select()
      .from(assets)
      .where(eq(assets.publicId, row.raw!.images[0]!.publicId));
    expect(recorded).toMatchObject({
      deckId: ctx.world.decks.family.id,
      source: 'ingest',
      uploadedBy: editor.id,
      format: expect.any(String),
    });
    expect(recorded!.width).toBeGreaterThan(0);
  });

  it('rejects an empty share (400)', async () => {
    const res = await postJson({ deckId: 'family' }, editor.email);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid url (400)', async () => {
    const res = await postJson({ deckId: 'family', url: 'ftp://nope' }, editor.email);
    expect(res.status).toBe(400);
  });

  it('rejects a disallowed file type (400)', async () => {
    const form = new FormData();
    form.set('deckId', 'family');
    form.append('files', imageFile('doc.pdf', 'application/pdf'));
    expect((await postForm(form, editor.email)).status).toBe(400);
  });

  it('rejects more than 3 files (400)', async () => {
    const form = new FormData();
    form.set('deckId', 'family');
    for (let i = 0; i < 4; i++) form.append('files', imageFile(`f${i}.png`));
    expect((await postForm(form, editor.email)).status).toBe(400);
  });

  it('a reader cannot share into the deck (403)', async () => {
    const res = await postJson({ deckId: 'family', text: 'hi' }, reader.email);
    expect(res.status).toBe(403);
  });

  it("a deck the caller can't see is 404", async () => {
    const res = await postJson({ deckId: 'family', text: 'hi' }, OTHER_EMAIL);
    expect(res.status).toBe(404);
  });

  it('enforces the rolling daily cap (429 + Retry-After)', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await postJson({ deckId: 'family', text: `n${i}` }, capped.email)).status).toBe(202);
    }
    const res = await postJson({ deckId: 'family', text: 'one too many' }, capped.email);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();

    ctx.clock.advance(25 * 60 * 60 * 1000);
    try {
      expect((await postJson({ deckId: 'family', text: 'next day' }, capped.email)).status).toBe(
        202,
      );
    } finally {
      ctx.clock.reset();
    }
  });

  it('GET /ingest/{id}: the sharer and a publisher see the job, others get 404', async () => {
    const created = await json(
      await postJson({ deckId: 'family', text: 'job view' }, editor.email),
    );

    const mine = await ctx.app.request(`/ingest/${created.id}`, { headers: ctx.as(editor.email) });
    expect(mine.status).toBe(200);
    const body = await json(mine);
    expect(body).toMatchObject({ id: created.id, status: 'queued', costUsd: 0, attempts: 0 });

    const owner = await ctx.app.request(`/ingest/${created.id}`, { headers: ctx.as() });
    expect(owner.status).toBe(200);

    const asReader = await ctx.app.request(`/ingest/${created.id}`, {
      headers: ctx.as(reader.email),
    });
    expect(asReader.status).toBe(404);

    const missing = await ctx.app.request('/ingest/not-a-uuid', { headers: ctx.as() });
    expect(missing.status).toBe(404);
  });

  it('requires a session (401)', async () => {
    const res = await ctx.app.request('/ingest', {
      method: 'POST',
      headers: ctx.anon(),
      body: JSON.stringify({ text: 'x' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('ingest tokens (D99)', () => {
  const queue = new RecordingQueue();
  const ctx = setupApiTest({ ingest: { enabled: true, uploads: null, queue } });

  const createToken = (body: unknown, email?: string) =>
    ctx.app.request('/me/ingest-tokens', {
      method: 'POST',
      headers: ctx.as(email),
      body: JSON.stringify(body),
    });

  const shareWith = (token: string, body: unknown) =>
    ctx.app.request('/ingest', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('creates a token (shown once), lists it without the secret, and shares with it', async () => {
    const res = await createToken({ label: 'iPhone', deckId: ctx.world.decks.family.id });
    expect(res.status).toBe(201);
    const created = await json(res);
    expect(created.token).toMatch(/^ing_[A-Za-z0-9_-]{43}$/);
    expect(created.prefix).toBe(created.token.slice(0, created.prefix.length));

    const list = await json(await ctx.app.request('/me/ingest-tokens', { headers: ctx.as() }));
    expect(list.data.map((t: { id: string }) => t.id)).toContain(created.id);
    expect(JSON.stringify(list)).not.toContain(created.token);

    const shared = await shareWith(created.token, { text: 'from the shortcut' });
    expect(shared.status).toBe(202);
    const { id } = await json(shared);
    const [row] = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, id));
    expect(row.channel).toBe('shortcut');
    expect(row.deckId).toBe(ctx.world.decks.family.id);
    expect(row.userId).toBe(ctx.world.owner.id);

    const after = await json(await ctx.app.request('/me/ingest-tokens', { headers: ctx.as() }));
    const listed = after.data.find((t: { id: string }) => t.id === created.id);
    expect(listed.lastUsedAt).not.toBeNull();
  });

  it('refuses an image share when no upload store is configured (503)', async () => {
    const { token } = await json(await createToken({ label: 'imgs' }));
    const form = new FormData();
    form.set('deckId', 'family');
    form.append('files', imageFile());
    const res = await ctx.app.request('/ingest', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    expect(res.status).toBe(503);
  });

  it('a token works only on POST /ingest (401 elsewhere)', async () => {
    const { token } = await json(await createToken({ label: 'scope' }));
    const res = await ctx.app.request('/me', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it('a revoked or unknown token is 401', async () => {
    const created = await json(await createToken({ label: 'revoke me' }));
    const del = await ctx.app.request(`/me/ingest-tokens/${created.id}`, {
      method: 'DELETE',
      headers: ctx.as(),
    });
    expect(del.status).toBe(204);
    expect((await shareWith(created.token, { text: 'x' })).status).toBe(401);
    expect((await shareWith(`ing_${'A'.repeat(43)}`, { text: 'x' })).status).toBe(401);
  });

  it('revoking an unknown id is 404', async () => {
    const res = await ctx.app.request('/me/ingest-tokens/00000000-0000-4000-8000-000000000000', {
      method: 'DELETE',
      headers: ctx.as(),
    });
    expect(res.status).toBe(404);
  });

  it("a token can't target a deck the user can't see (404)", async () => {
    const res = await createToken({ label: 'x', deckId: ctx.world.decks.otherPersonal.id });
    expect(res.status).toBe(404);
  });

  it('caps live tokens at 5 (409)', async () => {
    const live = await json(await ctx.app.request('/me/ingest-tokens', { headers: ctx.as() }));
    for (let i = live.data.length; i < 5; i++) {
      expect((await createToken({ label: `t${i}` })).status).toBe(201);
    }
    expect((await createToken({ label: 'sixth' })).status).toBe(409);
  });
});

describe('POST /ingest when extraction is off', () => {
  const ctx = setupApiTest({ ingest: { enabled: false } });

  it('is 503', async () => {
    const res = await ctx.app.request('/ingest', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({ deckId: 'family', text: 'x' }),
    });
    expect(res.status).toBe(503);
  });
});
