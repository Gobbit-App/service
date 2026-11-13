import { beforeAll, describe, expect, it } from 'vitest';
import { withTestDb } from './db-fixture';
import { createAccountUser, createDeck } from './factories';

/** 045: DB invariants of media cards and recorded files (D386, D388, D398). */
describe('media cards (DB invariants)', () => {
  const ctx = withTestDb();
  let deckId: string;

  beforeAll(async () => {
    const owner = await createAccountUser(ctx.db);
    deckId = (await createDeck(ctx.db, owner)).id;
  });

  const insertMedia = (payload: unknown) =>
    ctx.pool.query(
      `INSERT INTO items (deck_id, type, status, title, payload) VALUES ($1, 'media', 'proposed', 'M', $2::jsonb)`,
      [deckId, JSON.stringify(payload)],
    );
  const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ publicId: `p${i}` }));

  it('accepts a gallery of 1 to 8 photos and one file of the other kinds', async () => {
    await insertMedia({ kind: 'image', images: photos(1) });
    await insertMedia({ kind: 'image', images: photos(8) });
    for (const kind of ['pdf', 'audio', 'video'])
      await insertMedia({ kind, publicId: `f-${kind}` });
  });

  it('requires a known kind', async () => {
    await expect(insertMedia({ publicId: 'x' })).rejects.toThrow(/items_media_kind_check/);
    await expect(insertMedia({ kind: 'zip', publicId: 'x' })).rejects.toThrow(
      /items_media_kind_check/,
    );
  });

  it('bounds a gallery to 1..8 photos that each name a file', async () => {
    await expect(insertMedia({ kind: 'image', images: [] })).rejects.toThrow(
      /items_media_files_check/,
    );
    await expect(insertMedia({ kind: 'image', images: photos(9) })).rejects.toThrow(
      /items_media_files_check/,
    );
    await expect(insertMedia({ kind: 'image', images: [{ alt: 'no file' }] })).rejects.toThrow(
      /items_media_files_check/,
    );
    await expect(insertMedia({ kind: 'image', images: [{ publicId: '' }] })).rejects.toThrow(
      /items_media_files_check/,
    );
    await expect(insertMedia({ kind: 'image', publicId: 'flat' })).rejects.toThrow(
      /items_media_files_check/,
    );
  });

  it('requires the one file of a PDF, audio or video card', async () => {
    await expect(insertMedia({ kind: 'pdf' })).rejects.toThrow(/items_media_files_check/);
    await expect(insertMedia({ kind: 'video', publicId: '' })).rejects.toThrow(
      /items_media_files_check/,
    );
  });

  it('leaves other card types alone', async () => {
    await ctx.pool.query(
      `INSERT INTO items (deck_id, type, status, title, payload) VALUES ($1, 'text', 'proposed', 'T', '{}'::jsonb)`,
      [deckId],
    );
  });

  const insertAsset = (kind: string, resourceType: string, extra = '') =>
    ctx.pool.query(
      `INSERT INTO assets (deck_id, public_id, source, kind, resource_type${extra ? ', ' + extra.split('=')[0] : ''})
       VALUES ($1, $2, 'editor', $3, $4${extra ? ', ' + extra.split('=')[1] : ''})`,
      [deckId, `a-${kind}-${resourceType}-${Math.random()}`, kind, resourceType],
    );

  it('stores PDFs as image resources and audio/video as video resources (D388)', async () => {
    await insertAsset('pdf', 'image');
    await insertAsset('audio', 'video');
    await expect(insertAsset('pdf', 'video')).rejects.toThrow(/assets_kind_resource_check/);
    await expect(insertAsset('video', 'image')).rejects.toThrow(/assets_kind_resource_check/);
  });

  it('keeps durations and page counts positive', async () => {
    await expect(insertAsset('video', 'video', 'duration_ms=0')).rejects.toThrow(
      /assets_duration_chk/,
    );
    await expect(insertAsset('pdf', 'image', 'pages=0')).rejects.toThrow(/assets_pages_chk/);
  });
});
