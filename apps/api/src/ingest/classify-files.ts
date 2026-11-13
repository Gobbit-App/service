import { INGEST_MAX_IMAGES, type IngestUnusedFile, type MediaKind } from '@gobbit/shared';
import { sniffMediaFile, type SniffedFile } from './media-sniff';

/** One file of a share, as the route or email-in hands it over. */
export interface ShareFile {
  bytes: Uint8Array;
  mime: string;
  /** The name it was shared with, when known (title fallback, D395). */
  name?: string;
}

/** D393: the ingest size limit per kind (bytes). */
export type IngestMaxBytes = Record<MediaKind, number>;

/** A used file with what its bytes proved. */
export type ClassifiedFile = ShareFile & SniffedFile & { uploadMime: string };

export interface ClassifiedShare {
  /** D395/D398: the photos a photo proposal holds, in share order. */
  images: ClassifiedFile[];
  /** D395: the one PDF, audio or video file a file proposal holds. */
  file: ClassifiedFile | null;
  /** FR-027: everything else, with why. */
  unused: IngestUnusedFile[];
}

/** The content type the provider is given for a sniffed format (never the client's claim). */
const UPLOAD_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  amr: 'audio/amr',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
};

/**
 * D395/FR-027: the first supported file within its kind's limit decides what the share becomes.
 * Photos: every photo (up to `INGEST_MAX_IMAGES`) joins one gallery, in share order. PDF, audio
 * or video: that one file. Anything unreadable, over its limit, or of another kind is unused.
 */
export function classifyShareFiles(files: ShareFile[], limits: IngestMaxBytes): ClassifiedShare {
  const out: ClassifiedShare = { images: [], file: null, unused: [] };
  let decided: MediaKind | null = null;
  for (const f of files) {
    const unused = (reason: IngestUnusedFile['reason']) =>
      out.unused.push({ mime: f.mime || 'unknown', bytes: f.bytes.byteLength, reason });
    const sniffed = sniffMediaFile(f.bytes, f.mime);
    if (!sniffed) {
      unused('unsupported');
      continue;
    }
    if (f.bytes.byteLength > limits[sniffed.kind]) {
      unused('too_large');
      continue;
    }
    decided ??= sniffed.kind;
    const used: ClassifiedFile = {
      ...f,
      ...sniffed,
      uploadMime: UPLOAD_MIME[sniffed.format] ?? (f.mime || 'application/octet-stream'),
    };
    if (decided === 'image' && sniffed.kind === 'image' && out.images.length < INGEST_MAX_IMAGES) {
      out.images.push(used);
    } else if (decided !== 'image' && out.file === null && sniffed.kind === decided) {
      out.file = used;
    } else {
      unused('extra_file');
    }
  }
  return out;
}
