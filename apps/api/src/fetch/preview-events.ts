/**
 * D352: the link preview decision events and their closed sets. They carry ids, the host name
 * and these values only, never URLs, titles, captions or descriptions (FR-017).
 */

export const PREVIEW_EVENTS = {
  built: 'link_preview.built',
  lookup: 'link_preview.lookup',
  applied: 'link_preview.applied',
  snapshotImage: 'link_snapshot.image',
  backfill: 'link_snapshot.backfill',
} as const;

/** D344: where an image candidate was read from, in the order they are tried. */
export const imageSources = [
  'og',
  'og_secure',
  'twitter',
  'structured_data',
  'image_src',
  'video_poster',
  'article',
  'host_lookup',
] as const;
export type ImageSource = (typeof imageSources)[number];

export const titleSources = ['og', 'title_tag', 'host_lookup', 'none'] as const;
export type TitleSource = (typeof titleSources)[number];

export const previewCallers = ['ingest', 'snapshot', 'editor'] as const;
export type PreviewCaller = (typeof previewCallers)[number];

/** `link_preview.built` */
export const previewOutcomes = ['preview', 'none', 'discarded'] as const;
export type PreviewOutcome = (typeof previewOutcomes)[number];
export const previewReasons = [
  'generic',
  'login_wall',
  'unavailable',
  'fetch_failed',
  'nothing',
] as const;
export type PreviewReason = (typeof previewReasons)[number];

/** `link_preview.lookup`, and the `lookup` field of `link_preview.built`. */
export const lookupOutcomes = ['ok', 'empty', 'failed'] as const;
export type LookupOutcome = (typeof lookupOutcomes)[number];
export const lookupReasons = ['timeout', 'http_error', 'invalid', 'blocked'] as const;
export type LookupReason = (typeof lookupReasons)[number];
export type LookupState = LookupOutcome | 'skipped';

/** `link_preview.applied` */
export const appliedImages = ['member_share', 'page', 'none'] as const;
export type AppliedImage = (typeof appliedImages)[number];
export const appliedDescriptions = ['caption', 'page', 'none'] as const;
export type AppliedDescription = (typeof appliedDescriptions)[number];

/** `link_snapshot.image` */
export const snapshotImageOutcomes = [
  'copied',
  'dropped',
  'kept',
  'none',
  'member_choice',
] as const;
export type SnapshotImageOutcome = (typeof snapshotImageOutcomes)[number];

/** The host name events carry: lower-case, without `www.`; null for an unparseable URL. */
export function previewHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}
