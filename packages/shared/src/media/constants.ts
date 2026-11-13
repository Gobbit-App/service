import { INGEST_IMAGE_MAX_BYTES, INGEST_IMAGE_MIMES } from '../ingest/constants';
import type { AssetResourceType, MediaKind } from '../enums';

/** D133: editor image uploads use the same size cap and types as ingest. */
export const MEDIA_IMAGE_MAX_BYTES = INGEST_IMAGE_MAX_BYTES;
export const MEDIA_IMAGE_MIMES = INGEST_IMAGE_MIMES;
/** Cloudinary `allowed_formats` signed into every editor upload. */
export const MEDIA_IMAGE_FORMATS = ['jpg', 'png', 'webp', 'heic', 'heif'] as const;
/** File extensions accepted when the browser reports no MIME type (iOS HEIC). */
export const MEDIA_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const;
/** Signed upload permissions per user per hour. */
export const MEDIA_SIGN_RATE_PER_HOUR = 60;
/** Cloudinary rejects signatures older than an hour; the editor re-signs after 50 minutes. */
export const MEDIA_SIGN_TTL_MS = 50 * 60_000;
/** Failed-upload reports per user per hour (they only feed the API log). */
export const MEDIA_UPLOAD_FAILURE_RATE_PER_HOUR = 30;
/** Longest Cloudinary error message kept from a failed upload. */
export const MEDIA_UPLOAD_FAILURE_MESSAGE_MAX = 500;

/** D134: link preview lookup. */
export const LINK_PREVIEW_RATE_PER_HOUR = 30;
export const LINK_PREVIEW_TITLE_MAX = 200;
export const LINK_PREVIEW_DESCRIPTION_MAX = 500;
/** Longer `og:image` URLs are dropped, so a filled preview always fits the payload limit. */
export const LINK_PREVIEW_IMAGE_URL_MAX = 2048;
export const LINK_PREVIEW_CACHE_MAX = 200;
export const LINK_PREVIEW_CACHE_TTL_MS = 3_600_000;

/** D158: an unreferenced asset is deleted once it is older than this. */
export const MEDIA_ORPHAN_GRACE_DAYS = 7;
/** D158: the daily orphan sweep (UTC). */
export const MEDIA_SWEEP_CRON = '0 6 * * *';
/** Most assets one sweep run deletes. */
export const MEDIA_SWEEP_BATCH = 500;
/** Cloudinary's per-call limit for `delete_resources`. */
export const MEDIA_DELETE_CHUNK = 100;
/** D157: recorded upload confirmations per user per hour. */
export const MEDIA_CONFIRM_RATE_PER_HOUR = 60;
/** D160: largest width/height an image payload may carry. */
export const MEDIA_IMAGE_DIMENSION_MAX = 20000;

/**
 * D389: the formats each kind may be stored in. The lists are disjoint, so a stored file's format
 * names exactly one kind (D390: the server derives the kind from it).
 */
export const MEDIA_FORMATS = {
  image: MEDIA_IMAGE_FORMATS,
  pdf: ['pdf'],
  audio: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac', 'amr'],
  video: ['mp4', 'mov', 'm4v', 'webm', '3gp'],
} as const satisfies Record<MediaKind, readonly string[]>;

/** Spellings a provider may report for a format besides the signed one. */
const FORMAT_ALIASES: Record<string, string> = { jpeg: 'jpg' };

/** D390: the kind a stored format belongs to, or null when no kind allows it. */
export function kindForFormat(format: string): MediaKind | null {
  const f = format.trim().toLowerCase();
  const normal = FORMAT_ALIASES[f] ?? f;
  for (const kind of Object.keys(MEDIA_FORMATS) as MediaKind[]) {
    if ((MEDIA_FORMATS[kind] as readonly string[]).includes(normal)) return kind;
  }
  return null;
}

/** D388: images and PDFs are provider `image` resources; audio and video are `video`. */
export function resourceTypeForKind(kind: MediaKind): AssetResourceType {
  return kind === 'audio' || kind === 'video' ? 'video' : 'image';
}

/** D393: default editor size limits per kind (bytes); operators override all but image by env. */
export const MEDIA_MAX_BYTES_DEFAULTS = {
  image: MEDIA_IMAGE_MAX_BYTES,
  pdf: 10 * 1024 * 1024,
  audio: 15 * 1024 * 1024,
  video: 25 * 1024 * 1024,
} as const satisfies Record<MediaKind, number>;

/** D393: the env variable overriding each kind's editor limit (the image limit is fixed, D133). */
export const MEDIA_MAX_BYTES_ENV = {
  pdf: 'MEDIA_MAX_BYTES_PDF',
  audio: 'MEDIA_MAX_BYTES_AUDIO',
  video: 'MEDIA_MAX_BYTES_VIDEO',
} as const;

/** Effective per-kind limits (the API reads env into this shape; the web gets it from /config). */
export type MediaMaxBytes = Record<MediaKind, number>;

/** D393: uploads are single requests, which the provider accepts up to this size. */
export const MEDIA_SINGLE_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

/** D398: most photos one card holds (bounded by the payload size, so a constant, not env). */
export const MEDIA_GALLERY_MAX = 8;
/** D398: longest per-photo/file description accepted on input (code points). */
export const MEDIA_ALT_MAX = 200;
/** Longest original file name kept on an asset and a payload. */
export const MEDIA_FILE_NAME_MAX = 200;
/** D390: most assets one sweep run verifies against the provider. */
export const MEDIA_VERIFY_BATCH = 200;

/** One delivered rendition of a stored file (contracts/delivery-urls.md). */
export type MediaRendition = {
  resourceType: AssetResourceType;
  /** Cloudinary transformation; '' for the original file. */
  transformation: string;
  /** Delivered extension (it picks the output format of video resources); none for images. */
  ext?: string;
};

/** Widths of every responsive picture (cards, stills, PDF pages). */
export const MEDIA_IMAGE_WIDTHS = [360, 720, 1080] as const;
/** Widths of a gallery photo or PDF page in the full-screen viewer. */
export const MEDIA_VIEWER_WIDTHS = [720, 1080, 2160] as const;

/**
 * D392: every delivery transformation in one place. The web and API URL builders and the signed
 * `eager` list (D389) read this table, so a delivered video or audio URL is always one the
 * provider generated at upload.
 */
export const MEDIA_DELIVERY = {
  image: (width: number): MediaRendition => ({
    resourceType: 'image',
    transformation: `f_auto,q_auto,c_limit,w_${width}`,
  }),
  pdfPage: (page: number, width: number): MediaRendition => ({
    resourceType: 'image',
    transformation: `pg_${page},f_auto,q_auto,c_limit,w_${width}`,
  }),
  pdfOriginal: { resourceType: 'image', transformation: '', ext: 'pdf' } as MediaRendition,
  videoStream: {
    resourceType: 'video',
    transformation: 'c_limit,w_1280,h_1280,q_auto,vc_auto',
    ext: 'mp4',
  } as MediaRendition,
  videoStill: (width: number): MediaRendition => ({
    resourceType: 'video',
    transformation: `so_auto,f_auto,q_auto,c_limit,w_${width}`,
    ext: 'jpg',
  }),
  audioStream: { resourceType: 'video', transformation: 'q_auto', ext: 'mp3' } as MediaRendition,
  audioWaveform: {
    resourceType: 'video',
    transformation: 'fl_waveform,co_white,b_transparent,w_720,h_96',
    ext: 'png',
  } as MediaRendition,
  shareVideo: {
    resourceType: 'video',
    transformation: 'so_auto,c_fill,w_1200,h_630',
    ext: 'jpg',
  } as MediaRendition,
  sharePdf: {
    resourceType: 'image',
    transformation: 'pg_1,c_fill,g_north,w_1200,h_630,f_jpg',
  } as MediaRendition,
} as const;

/** D392: the renditions generated at upload, per kind (only audio and video need them). */
export function mediaEagerRenditions(kind: MediaKind): MediaRendition[] {
  if (kind === 'video') {
    return [
      MEDIA_DELIVERY.videoStream,
      ...MEDIA_IMAGE_WIDTHS.map((w) => MEDIA_DELIVERY.videoStill(w)),
    ];
  }
  if (kind === 'audio') return [MEDIA_DELIVERY.audioStream, MEDIA_DELIVERY.audioWaveform];
  return [];
}

/** D389: Cloudinary's `eager` parameter (`t/ext|t/ext`), or null when the kind has none. */
export function mediaEagerParam(kind: MediaKind): string | null {
  const list = mediaEagerRenditions(kind);
  if (list.length === 0) return null;
  return list.map((r) => (r.ext ? `${r.transformation}/${r.ext}` : r.transformation)).join('|');
}

/** `<resource>/upload/[<transformation>/]<id>[.<ext>]`, the id's segments URL-encoded. */
export function mediaDeliveryPath(rendition: MediaRendition, publicId: string): string {
  const id = publicId.split('/').map(encodeURIComponent).join('/');
  const t = rendition.transformation ? `${rendition.transformation}/` : '';
  const ext = rendition.ext ? `.${rendition.ext}` : '';
  return `${rendition.resourceType}/upload/${t}${id}${ext}`;
}

/**
 * D387: a pre-045 flat image payload (`{ publicId, alt?, width?, height? }`) as a one-photo
 * gallery. Any other value is returned unchanged. Zod-free: the PWA normalizes drafts and cached
 * items with it, the API normalizes old clients' requests.
 */
export function normalizeLegacyMediaPayload<T>(payload: T): T | Record<string, unknown> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const p = payload as Record<string, unknown>;
  if ('kind' in p || typeof p['publicId'] !== 'string') return payload;
  const image: Record<string, unknown> = { publicId: p['publicId'] };
  for (const key of ['alt', 'width', 'height'] as const) {
    if (p[key] !== undefined && p[key] !== null) image[key] = p[key];
  }
  return { kind: 'image', images: [image] };
}

/** Full delivery URL for one rendition. */
export function mediaDeliveryUrl(
  cloudName: string,
  rendition: MediaRendition,
  publicId: string,
): string {
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/${mediaDeliveryPath(rendition, publicId)}`;
}
