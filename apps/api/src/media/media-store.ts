import { timingSafeEqual } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { assetResourceTypes, type AssetResourceType, type AssetSource } from '@gobbit/shared';
import type { CloudinaryCredentials } from '../lib/cloudinary-url';

/** What Cloudinary reports about one stored image. */
export interface StoredImage {
  publicId: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

/** D390: the provider's own facts about a stored file, read by the sweep's verify pass. */
export interface StoredResource {
  resourceType: AssetResourceType;
  bytes: number;
  format: string;
  width: number | null;
  height: number | null;
  /** PDFs only. */
  pages: number | null;
  /** Audio and video only, in milliseconds. */
  durationMs: number | null;
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
  /** At most `MEDIA_DELETE_CHUNK` ids per call, all of one resource type (D388). */
  deleteMany(
    publicIds: string[],
    resourceType?: AssetResourceType,
  ): Promise<Map<string, DeleteOutcome>>;
  /** Every resource type under the prefix. */
  deleteByPrefix(prefix: string): Promise<void>;
  /** D390: the provider's facts about one file; null when it doesn't know the id. */
  resource(publicId: string, resourceType: AssetResourceType): Promise<StoredResource | null>;
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

    async deleteMany(publicIds, resourceType = 'image') {
      const outcomes = new Map<string, DeleteOutcome>();
      if (publicIds.length === 0) return outcomes;
      try {
        const res = (await cloudinary.api.delete_resources(publicIds, {
          ...auth,
          resource_type: resourceType,
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
      // D388: PDFs live under `image`, audio and video under `video`.
      for (const resourceType of assetResourceTypes) {
        for (let round = 0; round < PREFIX_DELETE_ROUNDS; round += 1) {
          const res = (await cloudinary.api.delete_resources_by_prefix(prefix, {
            ...auth,
            resource_type: resourceType,
            invalidate: true,
          })) as { partial?: boolean };
          if (!res.partial) break;
        }
      }
    },

    async resource(publicId, resourceType) {
      try {
        const res = (await cloudinary.api.resource(publicId, {
          ...auth,
          resource_type: resourceType,
          pages: true,
          media_metadata: true,
        })) as {
          bytes: number;
          format: string;
          width?: number;
          height?: number;
          pages?: number;
          duration?: number;
        };
        return {
          resourceType,
          bytes: res.bytes,
          format: res.format,
          width: res.width ?? null,
          height: res.height ?? null,
          pages: res.pages ?? null,
          durationMs: typeof res.duration === 'number' ? Math.round(res.duration * 1000) : null,
        };
      } catch (err) {
        if ((err as { error?: { http_code?: number } }).error?.http_code === 404) return null;
        throw err;
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
  /** The resource type of each `deleteMany` call, in order (D388). */
  readonly deleteTypes: AssetResourceType[] = [];
  /** D390: what the provider reports per public id for the verify pass; absent → unknown. */
  readonly resources = new Map<string, StoredResource>();
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

  async deleteMany(publicIds: string[], resourceType: AssetResourceType = 'image') {
    this.deleteCalls.push([...publicIds]);
    this.deleteTypes.push(resourceType);
    const outcomes = new Map<string, DeleteOutcome>();
    for (const id of publicIds) {
      if (this.failing.has(id)) outcomes.set(id, 'failed');
      else {
        const known = this.images.delete(id) || this.resources.delete(id);
        outcomes.set(id, known ? 'deleted' : 'not_found');
      }
    }
    return outcomes;
  }

  async resource(publicId: string, resourceType: AssetResourceType) {
    const found = this.resources.get(publicId);
    return found && found.resourceType === resourceType ? found : null;
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
