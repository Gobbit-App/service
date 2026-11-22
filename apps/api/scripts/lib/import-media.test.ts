/**
 * T059 / D450: media files named by an import file (`cover:`, `image:`), uploaded from the CLI.
 *
 * Interface for T063 (`./import-media.ts`), which this test pins down:
 *
 *   export interface CloudinaryUpload {       // Cloudinary's upload response (snake_case)
 *     public_id: string; version: number; signature: string; bytes: number; format: string;
 *     resource_type: string; width?: number; height?: number; duration?: number (seconds);
 *     pages?: number; etag?: string; original_filename?: string;
 *   }
 *   export type MediaUploader = (
 *     signed: MediaSignResponse,                               // body of POST media/sign
 *     file: { name: string; mime: string; bytes: Uint8Array },  // mime = classifyShareFiles uploadMime
 *   ) => Promise<CloudinaryUpload>;
 *
 *   createMediaImporter(opts: {
 *     request: ApiRequest;                    // api-cli bearer request: (method, path, body?) => json
 *     deckId: string;
 *     baseDir: string;                        // the import file's folder
 *     readFile: (absPath: string) => Promise<Uint8Array>;   // rejects when missing
 *     uploader: MediaUploader;
 *   }): {
 *     cover(path: string, line: number): Promise<{ publicId: string }>;   // image files only
 *     image(path: string, line: number): Promise<MediaPayload>;           // any kind, the card payload
 *   }
 *
 * Per distinct path (resolve(baseDir, path)): readFile -> classifyShareFiles (kind from the bytes;
 * import it from '../../src/ingest/classify-files', it is not in @gobbit/shared) -> request
 * POST /decks/{deckId}/media/sign {kind} -> uploader(signed, file) -> request
 * POST /decks/{deckId}/media/assets (confirm body built from the Cloudinary response:
 * publicId, version, signature, width, height, bytes, format, kind, resourceType, durationMs =
 * round(duration * 1000), pages, etag, originalFilename) -> the recorded MediaAsset is cached and
 * reused for later rows.
 * Failures throw `Error` whose message starts `line <n>: <path>: ` and name the reason; nothing is
 * signed or uploaded for a path that fails the local checks (absolute, leaves baseDir, missing,
 * unsupported, not an image for `cover`). Not covered here: the per-kind size limit (needs
 * megabyte fixtures); T063 should still check it with MEDIA_MAX_BYTES_DEFAULTS.
 * Payloads come from the recorded asset: image -> { kind:'image', images:[{ publicId, width, height }] };
 * pdf/audio/video -> { kind, publicId, fileName?, pages?, durationMs?, width?, height? }.
 */
import { describe, expect, it, vi } from 'vitest';
import { mediaPayloadSchema } from '@gobbit/shared';
import type { ApiRequest } from './api-cli';
import { createMediaImporter, type MediaUploader } from './import-media';

const bytesOf = (...head: number[]) =>
  Uint8Array.from([...head, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const PDF = bytesOf(...Buffer.from('%PDF-1.7'));
const EXE = bytesOf(0x4d, 0x5a, 0x90, 0x00);

const FILES: Record<string, Uint8Array> = {
  '/notes/pics/a.png': PNG,
  '/notes/b.pdf': PDF,
  '/notes/virus.png': EXE,
};

function setup() {
  const order: string[] = [];
  const request = vi.fn(async (method: string, path: string, body?: unknown) => {
    order.push(`${method} ${path}`);
    if (path.endsWith('/media/sign')) {
      return { kind: (body as { kind: string }).kind, uploadUrl: 'https://up.test', apiKey: 'k' };
    }
    const b = body as Record<string, unknown>;
    return {
      publicId: b.publicId,
      kind: b.kind,
      width: b.width ?? null,
      height: b.height ?? null,
      pages: b.pages ?? null,
      originalFilename: b.originalFilename ?? null,
    };
  }) as unknown as ApiRequest;
  const uploader = vi.fn(async (_signed, file) => {
    order.push(`upload ${file.name}`);
    const pdf = file.mime === 'application/pdf';
    return {
      public_id: `gobbit/items/d1/${file.name}`,
      version: 7,
      signature: 'sig',
      bytes: file.bytes.byteLength,
      format: pdf ? 'pdf' : 'png',
      resource_type: 'image',
      ...(pdf ? { pages: 3 } : { width: 640, height: 480 }),
      original_filename: file.name,
    };
  }) as unknown as MediaUploader;
  const readFile = vi.fn(async (abs: string) => {
    const f = FILES[abs];
    if (!f) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return f;
  });
  const media = createMediaImporter({
    request,
    deckId: 'd1',
    baseDir: '/notes',
    readFile,
    uploader,
  });
  return { media, request, uploader, readFile, order };
}

describe('createMediaImporter', () => {
  it('resolves against the file folder and runs sign -> upload -> assets in order', async () => {
    const { media, order, readFile, uploader } = setup();
    const cover = await media.cover('pics/a.png', 4);
    expect(readFile).toHaveBeenCalledWith('/notes/pics/a.png');
    expect(order).toEqual([
      'POST /decks/d1/media/sign',
      'upload a.png',
      'POST /decks/d1/media/assets',
    ]);
    expect(cover).toEqual({ publicId: 'gobbit/items/d1/a.png' });
    const [signed, file] = vi.mocked(uploader).mock.calls[0]!;
    expect(signed.kind).toBe('image');
    expect(file).toMatchObject({ name: 'a.png', mime: 'image/png' });
  });

  it('signs the kind the bytes prove and records Cloudinary facts', async () => {
    const { media, request } = setup();
    await media.image('b.pdf', 9);
    expect(request).toHaveBeenCalledWith('POST', '/decks/d1/media/sign', { kind: 'pdf' });
    expect(request).toHaveBeenCalledWith(
      'POST',
      '/decks/d1/media/assets',
      expect.objectContaining({
        publicId: 'gobbit/items/d1/b.pdf',
        version: 7,
        signature: 'sig',
        kind: 'pdf',
        format: 'pdf',
        pages: 3,
      }),
    );
  });

  it('builds a valid media payload from the recorded asset', async () => {
    const { media } = setup();
    const img = await media.image('pics/a.png', 2);
    expect(img).toEqual({
      kind: 'image',
      images: [{ publicId: 'gobbit/items/d1/a.png', width: 640, height: 480 }],
    });
    const pdf = await media.image('b.pdf', 3);
    expect(pdf).toMatchObject({ kind: 'pdf', publicId: 'gobbit/items/d1/b.pdf', pages: 3 });
    expect(mediaPayloadSchema.safeParse(img).success).toBe(true);
    expect(mediaPayloadSchema.safeParse(pdf).success).toBe(true);
  });

  it('uploads one file once per run, however many rows use it', async () => {
    const { media, uploader, request } = setup();
    await media.cover('pics/a.png', 1);
    await media.image('pics/a.png', 5);
    await media.cover('./pics/a.png', 8);
    expect(uploader).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2); // one sign + one assets
  });

  it.each([
    ['missing file', 'nope.png', /^line 12: nope\.png: /],
    ['unsupported kind', 'virus.png', /^line 12: virus\.png: /],
    ['absolute path', '/etc/passwd', /^line 12: \/etc\/passwd: /],
    ['leaving the folder', '../secret.png', /^line 12: \.\.\/secret\.png: /],
    ['hidden leave', 'pics/../../x.png', /^line 12: pics\/\.\.\/\.\.\/x\.png: /],
  ])('%s: row error naming path and line, nothing uploaded', async (_n, path, message) => {
    const { media, uploader, request } = setup();
    await expect(media.image(path, 12)).rejects.toThrow(message);
    expect(uploader).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('refuses a path that leaves the folder without reading it', async () => {
    const { media, readFile } = setup();
    await expect(media.cover('../x.png', 1)).rejects.toThrow();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('a cover must be an image: a PDF is refused before any upload', async () => {
    const { media, uploader, request } = setup();
    await expect(media.cover('b.pdf', 6)).rejects.toThrow(/^line 6: b\.pdf: /);
    expect(uploader).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
