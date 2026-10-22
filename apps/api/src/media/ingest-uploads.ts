import { v2 as cloudinary } from 'cloudinary';
import { INGEST_IMAGE_LLM_WIDTH } from '@pb/shared';
import { cloudinaryDeliveryUrl, parseCloudinaryUrl } from '../lib/cloudinary-url';
import type { StoredImage } from './media-store';

/** One image from a POST /ingest multipart body (D101). */
export interface IngestUploadFile {
  bytes: Uint8Array;
  mime: string;
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
  /** The stored image with Cloudinary's dimensions, recorded as an asset (D157). */
  upload(jobId: string, deckId: string, file: IngestUploadFile): Promise<StoredImage>;
  /** Deletes every upload tagged with the job (failed/discarded jobs). */
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
      const dataUri = `data:${file.mime};base64,${Buffer.from(file.bytes).toString('base64')}`;
      const res = await cloudinary.uploader.upload(dataUri, {
        folder: ingestFolder(deckId),
        resource_type: 'image',
        tags: ['ingest', ingestJobTag(jobId)],
      });
      return {
        publicId: res.public_id,
        width: res.width,
        height: res.height,
        bytes: res.bytes,
        format: res.format,
      };
    },
    async deleteForJob(jobId) {
      await cloudinary.api.delete_resources_by_tag(ingestJobTag(jobId));
    },
    llmUrl: (publicId) => cloudinaryDeliveryUrl(cloudName, publicId, INGEST_LLM_TRANSFORMATION),
  };
}

/** In-memory store for tests: records uploads by public id and deletions by job. */
export class MemoryIngestUploads implements IngestUploadStore {
  readonly uploads = new Map<string, { jobId: string; file: IngestUploadFile }>();
  readonly deletedJobs: string[] = [];
  private seq = 0;

  constructor(private readonly cloudName = 'test-cloud') {}

  async upload(jobId: string, deckId: string, file: IngestUploadFile) {
    this.seq += 1;
    const publicId = `${ingestFolder(deckId)}/upload-${this.seq}`;
    this.uploads.set(publicId, { jobId, file });
    return { publicId, width: 1200, height: 900, bytes: file.bytes.byteLength, format: 'jpg' };
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
