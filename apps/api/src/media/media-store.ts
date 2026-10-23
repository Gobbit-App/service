import { timingSafeEqual } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import type { AssetSource } from '@pb/shared';
import type { CloudinaryCredentials } from '../lib/cloudinary-url';

/** What Cloudinary reports about one stored image. */
export interface StoredImage {
  publicId: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

/** Result of deleting one public id (D158): `not_found` counts as gone. */
export type DeleteOutcome = 'deleted' | 'not_found' | 'failed';

/** Folder for server-side uploads by source (data-model § Storage conventions). */
export function serverUploadFolder(source: AssetSource, deckId: string): string {
  if (source === 'ingest') return `gobbit/ingest/${deckId}`;
  if (source === 'link_snapshot') return `gobbit/links/${deckId}`;
  return `gobbit/items/${deckId}`;
}

/** Every storage prefix a deck owns; deleting the deck deletes all of them (D158). */
export function deckPrefixes(deckId: string): string[] {
  return [`gobbit/items/${deckId}/`, `gobbit/ingest/${deckId}/`, `gobbit/links/${deckId}/`];
}

/**
 * Cloudinary's upload response signature: SHA-1 over `public_id` + `version` + the API secret
 * (what `utils.verify_api_response_signature` computes, without the SDK's global config).
 */
export function uploadResponseSignature(
  publicId: string,
  version: number,
  apiSecret: string,
): string {
  // Default SHA-1; public ids and versions never contain the '&'/'=' that signature v2 escapes.
  return cloudinary.utils.api_sign_request({ public_id: publicId, version }, apiSecret);
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The only Cloudinary calls the asset registry makes. It never lists the account: orphans are
 * found in the database and deleted by id (D158).
 */
export interface MediaStore {
  uploadBuffer(input: {
    bytes: Uint8Array;
    mime: string;
    folder: string;
    tags: string[];
  }): Promise<StoredImage>;
  /** At most `MEDIA_DELETE_CHUNK` ids per call. */
  deleteMany(publicIds: string[]): Promise<Map<string, DeleteOutcome>>;
  deleteByPrefix(prefix: string): Promise<void>;
  /** True when `signature` is Cloudinary's signature for this upload response. */
  verifyResponse(publicId: string, version: number, signature: string): boolean;
}

/** Most `delete_resources_by_prefix` rounds per prefix (1000 ids each). */
const PREFIX_DELETE_ROUNDS = 20;

export function createCloudinaryMediaStore(creds: CloudinaryCredentials): MediaStore {
  const auth = { cloud_name: creds.cloudName, api_key: creds.apiKey, api_secret: creds.apiSecret };

  return {
    async uploadBuffer({ bytes, mime, folder, tags }) {
      const dataUri = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
      const res = await cloudinary.uploader.upload(dataUri, {
        ...auth,
        folder,
        tags,
        resource_type: 'image',
      });
      return {
        publicId: res.public_id,
        width: res.width,
        height: res.height,
        bytes: res.bytes,
        format: res.format,
      };
    },

    async deleteMany(publicIds) {
      const outcomes = new Map<string, DeleteOutcome>();
      if (publicIds.length === 0) return outcomes;
      try {
        const res = (await cloudinary.api.delete_resources(publicIds, {
          ...auth,
          resource_type: 'image',
          type: 'upload',
          invalidate: true,
        })) as { deleted?: Record<string, string> };
        for (const id of publicIds) {
          const status = res.deleted?.[id];
          outcomes.set(id, status === 'deleted' || status === 'not_found' ? status : 'failed');
        }
      } catch {
        for (const id of publicIds) outcomes.set(id, 'failed');
      }
      return outcomes;
    },

    async deleteByPrefix(prefix) {
      for (let round = 0; round < PREFIX_DELETE_ROUNDS; round += 1) {
        const res = (await cloudinary.api.delete_resources_by_prefix(prefix, {
          ...auth,
          resource_type: 'image',
          invalidate: true,
        })) as { partial?: boolean };
        if (!res.partial) return;
      }
    },

    verifyResponse(publicId, version, signature) {
      return sameText(signature, uploadResponseSignature(publicId, version, creds.apiSecret));
    },
  };
}

/** In-memory store for tests. Signatures use `secret`, so tests can sign with the same helper. */
export class MemoryMediaStore implements MediaStore {
  readonly images = new Map<string, StoredImage & { tags: string[] }>();
  readonly deleteCalls: string[][] = [];
  readonly prefixDeletes: string[] = [];
  /** Ids whose deletion fails (tests of `failed`). */
  readonly failing = new Set<string>();
  /** Next upload result size; tests override it. */
  nextSize = { width: 800, height: 600 };
  uploadError: Error | null = null;
  private seq = 0;

  constructor(readonly secret = 'test-secret') {}

  async uploadBuffer(input: { bytes: Uint8Array; mime: string; folder: string; tags: string[] }) {
    if (this.uploadError) throw this.uploadError;
    this.seq += 1;
    const image = {
      publicId: `${input.folder}/upload-${this.seq}`,
      ...this.nextSize,
      bytes: input.bytes.byteLength,
      format: input.mime.split('/')[1] ?? 'jpg',
      tags: input.tags,
    };
    this.images.set(image.publicId, image);
    return image;
  }

  async deleteMany(publicIds: string[]) {
    this.deleteCalls.push([...publicIds]);
    const outcomes = new Map<string, DeleteOutcome>();
    for (const id of publicIds) {
      if (this.failing.has(id)) outcomes.set(id, 'failed');
      else outcomes.set(id, this.images.delete(id) ? 'deleted' : 'not_found');
    }
    return outcomes;
  }

  async deleteByPrefix(prefix: string) {
    this.prefixDeletes.push(prefix);
    for (const id of [...this.images.keys()]) {
      if (id.startsWith(prefix)) this.images.delete(id);
    }
  }

  verifyResponse(publicId: string, version: number, signature: string): boolean {
    return sameText(signature, uploadResponseSignature(publicId, version, this.secret));
  }

  /** The signature Cloudinary would return for this upload. */
  sign(publicId: string, version: number): string {
    return uploadResponseSignature(publicId, version, this.secret);
  }
}
