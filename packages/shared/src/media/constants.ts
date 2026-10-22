import { INGEST_IMAGE_MAX_BYTES, INGEST_IMAGE_MIMES } from '../ingest/constants';

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
