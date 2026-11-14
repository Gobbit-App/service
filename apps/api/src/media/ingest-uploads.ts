import { v2 as cloudinary } from 'cloudinary';
import {
  INGEST_IMAGE_LLM_WIDTH,
  mediaEagerParam,
  resourceTypeForKind,
  type AssetResourceType,
  type MediaKind,
} from '@gobbit/shared';
import { cloudinaryDeliveryUrl, parseCloudinaryUrl } from '../lib/cloudinary-url';

/** One file from a POST /ingest multipart body or an email attachment (D101, D395). */
export interface IngestUploadFile {
  bytes: Uint8Array;
  mime: string;
  /** 045: what the bytes proved (default image); picks the resource type and eager renditions. */
  kind?: MediaKind;
}

/** What the provider reported about one server upload (D390: its own facts, not a client's). */
export interface StoredUpload {
  publicId: string;
  width: number | null;
  height: number | null;
  bytes: number;
  format: string;
  resourceType: AssetResourceType;
  /** PDFs only. */
  pages: number | null;
  /** Audio and video only, in milliseconds. */
  durationMs: number | null;
  /** D396: content fingerprint. */
  etag: string | null;
}

/** Tag on every upload of a job, so a failed/discarded job's images go in one call (D94). */
export function ingestJobTag(jobId: string): string {
  return `job:${jobId}`;
}

/** Folder that holds a deck's ingest uploads. */
export function ingestFolder(deckId: string): string {
  return `gobbit/ingest/${deckId}`;
}

/** D101: the derived JPEG the model sees (long edge capped, auto quality). */
export const INGEST_LLM_TRANSFORMATION = `f_jpg,w_${INGEST_IMAGE_LLM_WIDTH},c_limit,q_auto`;

/** Where ingest uploads live; Cloudinary in production, memory in tests. */
export interface IngestUploadStore {
  /** The stored file with the provider's facts, recorded as an asset (D157, D390). */
  upload(jobId: string, deckId: string, file: IngestUploadFile): Promise<StoredUpload>;
  /** Deletes every upload tagged with the job (failed/discarded jobs), of any resource type. */
  deleteForJob(jobId: string): Promise<void>;
  /** Absolute URL of the derived JPEG for the extractor. */
  llmUrl(publicId: string): string;
}

/** Cloudinary-backed store; credentials come from CLOUDINARY_URL and never leave the server. */
export function createCloudinaryIngestUploads(cloudinaryUrl: string): IngestUploadStore {
  const { cloudName, apiKey, apiSecret } = parseCloudinaryUrl(cloudinaryUrl);
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return {
    async upload(jobId, deckId, file) {
      const kind = file.kind ?? 'image';
      const resourceType = resourceTypeForKind(kind);
      const eager = mediaEagerParam(kind);
      const dataUri = `data:${file.mime};base64,${Buffer.from(file.bytes).toString('base64')}`;
      const res = (await cloudinary.uploader.upload(dataUri, {
        folder: ingestFolder(deckId),
        resource_type: resourceType,
        tags: ['ingest', ingestJobTag(jobId)],
        // D392: audio and video renditions are generated at upload, as for the editor.
        ...(eager ? { eager, eager_async: true } : {}),
      })) as {
        public_id: string;
        width?: number;
        height?: number;
        bytes: number;
        format: string;
        pages?: number;
        duration?: number;
        etag?: string;
      };
      return {
        publicId: res.public_id,
        width: res.width && res.width > 0 ? res.width : null,
        height: res.height && res.height > 0 ? res.height : null,
        bytes: res.bytes,
        format: res.format,
        resourceType,
        pages: kind === 'pdf' && res.pages ? res.pages : null,
        durationMs:
          (kind === 'audio' || kind === 'video') && res.duration
            ? Math.max(1, Math.round(res.duration * 1000))
            : null,
        etag: res.etag ?? null,
      };
    },
    async deleteForJob(jobId) {
      await cloudinary.api.delete_resources_by_tag(ingestJobTag(jobId));
      await cloudinary.api.delete_resources_by_tag(ingestJobTag(jobId), { resource_type: 'video' });
    },
    llmUrl: (publicId) => cloudinaryDeliveryUrl(cloudName, publicId, INGEST_LLM_TRANSFORMATION),
  };
}

/** In-memory store for tests: records uploads by public id and deletions by job. */
export class MemoryIngestUploads implements IngestUploadStore {
  readonly uploads = new Map<string, { jobId: string; file: IngestUploadFile }>();
  readonly deletedJobs: string[] = [];
  /** Facts the next non-image upload reports; tests override them (e.g. a PDF without pages). */
  nextFacts: Partial<Pick<StoredUpload, 'pages' | 'durationMs' | 'etag'>> = {};
  private seq = 0;

  constructor(private readonly cloudName = 'test-cloud') {}

  async upload(jobId: string, deckId: string, file: IngestUploadFile): Promise<StoredUpload> {
    this.seq += 1;
    const publicId = `${ingestFolder(deckId)}/upload-${this.seq}`;
    this.uploads.set(publicId, { jobId, file });
    const kind = file.kind ?? 'image';
    const bytes = file.bytes.byteLength;
    const etag = `etag-${bytes}-${file.bytes[0] ?? 0}`;
    if (kind === 'image') {
      return {
        publicId,
        width: 1200,
        height: 900,
        bytes,
        format: 'jpg',
        resourceType: 'image',
        pages: null,
        durationMs: null,
        etag,
      };
    }
    const facts = {
      pages: kind === 'pdf' ? 3 : null,
      durationMs: kind === 'pdf' ? null : 4000,
      etag,
      ...this.nextFacts,
    };
    return {
      publicId,
      width: kind === 'audio' ? null : 1080,
      height: kind === 'audio' ? null : 1350,
      bytes,
      format: kind === 'pdf' ? 'pdf' : kind === 'audio' ? 'm4a' : 'mp4',
      resourceType: resourceTypeForKind(kind),
      ...facts,
    };
  }

  async deleteForJob(jobId: string) {
    this.deletedJobs.push(jobId);
    for (const [publicId, u] of this.uploads) {
      if (u.jobId === jobId) this.uploads.delete(publicId);
    }
  }

  llmUrl(publicId: string): string {
    return cloudinaryDeliveryUrl(this.cloudName, publicId, INGEST_LLM_TRANSFORMATION);
  }
}
