import { basename, isAbsolute, relative, resolve } from 'node:path';
import {
  MEDIA_MAX_BYTES_DEFAULTS,
  type MediaAsset,
  type MediaAssetConfirmInput,
  type MediaKind,
  type MediaPayload,
  type MediaSignResponse,
} from '@gobbit/shared';
import { classifyShareFiles } from '../../src/ingest/classify-files';
import type { ApiRequest } from './api-cli';

/** D450: Cloudinary's upload response (snake_case). */
export interface CloudinaryUpload {
  public_id: string;
  version: number;
  signature: string;
  bytes: number;
  format: string;
  resource_type: string;
  width?: number;
  height?: number;
  /** Seconds. */
  duration?: number;
  pages?: number;
  etag?: string;
  original_filename?: string;
}

export type MediaUploader = (
  signed: MediaSignResponse,
  file: { name: string; mime: string; bytes: Uint8Array },
) => Promise<CloudinaryUpload>;

/** The multipart upload the editor makes (apps/web/src/editor/upload.ts), from Node. */
export const cloudinaryUploader: MediaUploader = async (signed, file) => {
  const form = new FormData();
  form.append(
    'file',
    new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.mime }),
    file.name,
  );
  form.append('api_key', signed.apiKey);
  form.append('timestamp', String(signed.timestamp));
  form.append('signature', signed.signature);
  form.append('folder', signed.folder);
  form.append('tags', signed.tags);
  form.append('allowed_formats', signed.allowedFormats);
  if (signed.eager) {
    form.append('eager', signed.eager);
    form.append('eager_async', String(signed.eagerAsync ?? true));
  }
  const res = await fetch(signed.uploadUrl, { method: 'POST', body: form });
  if (!res.ok)
    throw new Error(`upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as CloudinaryUpload;
};

export function createMediaImporter(opts: {
  request: ApiRequest;
  deckId: string;
  baseDir: string;
  readFile: (absPath: string) => Promise<Uint8Array>;
  uploader: MediaUploader;
}) {
  const { request, deckId, baseDir, readFile, uploader } = opts;
  const cache = new Map<string, Promise<MediaAsset>>();

  async function upload(path: string, imageOnly: boolean): Promise<MediaAsset> {
    const abs = resolve(baseDir, path);
    const out = relative(baseDir, abs);
    if (isAbsolute(path) || out.startsWith('..') || isAbsolute(out)) {
      throw new Error('must be a relative path inside the import file folder');
    }
    let bytes: Uint8Array;
    try {
      bytes = await readFile(abs);
    } catch {
      throw new Error('file not found or unreadable');
    }
    const name = basename(abs);
    const { images, file, unused } = classifyShareFiles(
      [{ bytes, mime: '', name }],
      MEDIA_MAX_BYTES_DEFAULTS,
    );
    const found = images[0] ?? file;
    if (!found) {
      throw new Error(
        unused[0]?.reason === 'too_large' ? 'file is over the size limit' : 'unsupported file type',
      );
    }
    if (imageOnly && found.kind !== 'image') throw new Error('a cover must be an image');
    const signed = await request('POST', `/decks/${deckId}/media/sign`, { kind: found.kind });
    const up = await uploader(signed as MediaSignResponse, {
      name,
      mime: found.uploadMime,
      bytes,
    });
    const confirm: MediaAssetConfirmInput = {
      publicId: up.public_id,
      version: up.version,
      signature: up.signature,
      bytes: up.bytes,
      format: up.format,
      kind: found.kind,
      resourceType: up.resource_type === 'video' ? 'video' : 'image',
      ...(up.width && up.height ? { width: up.width, height: up.height } : {}),
      ...(up.duration ? { durationMs: Math.max(1, Math.round(up.duration * 1000)) } : {}),
      ...(up.pages ? { pages: up.pages } : {}),
      ...(up.etag ? { etag: up.etag } : {}),
      ...(up.original_filename ? { originalFilename: up.original_filename.slice(0, 200) } : {}),
    };
    return (await request('POST', `/decks/${deckId}/media/assets`, confirm)) as MediaAsset;
  }

  async function asset(path: string, line: number, imageOnly: boolean): Promise<MediaAsset> {
    const key = resolve(baseDir, path);
    try {
      let p = cache.get(key);
      if (!p) cache.set(key, (p = upload(path, imageOnly)));
      const a = await p;
      if (imageOnly && a.kind !== 'image') throw new Error('a cover must be an image');
      return a;
    } catch (e) {
      throw new Error(`line ${line}: ${path}: ${e instanceof Error ? e.message : String(e)}`, {
        cause: e,
      });
    }
  }

  return {
    async cover(path: string, line: number): Promise<{ publicId: string }> {
      return { publicId: (await asset(path, line, true)).publicId };
    },
    async image(path: string, line: number): Promise<MediaPayload> {
      const a = await asset(path, line, false);
      if (a.kind === 'image') {
        return {
          kind: 'image',
          images: [
            { publicId: a.publicId, width: a.width ?? undefined, height: a.height ?? undefined },
          ],
        };
      }
      return {
        kind: a.kind as Exclude<MediaKind, 'image'>,
        publicId: a.publicId,
        ...(a.originalFilename ? { fileName: a.originalFilename } : {}),
        ...(a.pages ? { pages: a.pages } : {}),
        ...(a.durationMs ? { durationMs: a.durationMs } : {}),
        ...(a.width && a.height ? { width: a.width, height: a.height } : {}),
      };
    },
  };
}
