import type { ItemCreate, LinkPayload } from '@gobbit/shared';
import { isLinkBearing } from '@gobbit/shared/links';
import { needsHonestLockedText, type ValidateContext } from '../ai/extract-validate';
import {
  PREVIEW_EVENTS,
  previewHost,
  type AppliedDescription,
  type AppliedImage,
} from '../fetch/preview-events';
import type { Logger } from '../lib/logger';

export interface AppliedPreview {
  image: AppliedImage;
  description: AppliedDescription;
  honestTitle: boolean;
}

/**
 * D352: what the validated link card's preview was built from: the member's shared image or the
 * page's, the caption or the page description, and whether the code wrote an honest title (D348).
 * Null for cards that carry no link (D372: link and event cards share the preview shape).
 */
export function appliedPreview(item: ItemCreate, ctx: ValidateContext): AppliedPreview | null {
  if (!isLinkBearing(item.type)) return null;
  const preview = (item.payload as LinkPayload).preview;
  const image: AppliedImage =
    ctx.imagePublicId && preview?.publicId === ctx.imagePublicId
      ? 'member_share'
      : preview?.image
        ? 'page'
        : 'none';
  const description: AppliedDescription = !preview?.description
    ? 'none'
    : preview.description === ctx.linkPreview?.description
      ? 'page'
      : 'caption';
  return { image, description, honestTitle: needsHonestLockedText(ctx) };
}

/** D352: logs `link_preview.applied` with ids, host and the closed-set values only. */
export function logPreviewApplied(
  log: Pick<Logger, 'info'>,
  applied: AppliedPreview,
  ids: { jobId: string; itemId: string; deckId: string },
  ctx: ValidateContext,
): void {
  log.info(
    {
      event: PREVIEW_EVENTS.applied,
      outcome: 'applied',
      ...ids,
      host: previewHost(ctx.sourceUrl),
      lockedHost: ctx.lockedHost?.label ?? null,
      ...applied,
    },
    'link preview applied',
  );
}
