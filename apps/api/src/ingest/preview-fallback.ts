import type { ExtractionSummary, IngestFailureCode, ItemCreate } from '@gobbit/shared';
import { validateProposal, type ValidateContext } from '../ai/extract-validate';
import type { ProposeCardInput } from '../ai/extract-prompt';
import type { Logger } from '../lib/logger';

/** D355: the decision event for a proposal built from the page preview, not the model. */
export const PREVIEW_FALLBACK_EVENT = 'ingest.preview_fallback';

export interface PreviewFallback {
  item: ItemCreate;
  /** Merged into the job's extraction summary; `fallback` marks it in the review queue. */
  summary: Omit<ExtractionSummary, 'model'>;
}

/** Whether the share's page preview says anything a card could be built from. */
export function hasPreviewDetails(ctx: ValidateContext): boolean {
  const preview = ctx.linkPreview;
  return Boolean(ctx.sourceUrl && (preview?.title || preview?.description || preview?.image));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, '');
  } catch {
    return url;
  }
}

/**
 * D355: when extraction failed, a link card from the page preview (title, description, image) so
 * the share is not lost; the reviewer decides in the review queue. It goes through the same
 * validator as a model answer, so locked hosts keep their rules (D347/D348). Null without a URL
 * or preview details. Confidence 0 and no categories (the default category holds it); the caller
 * never auto-publishes it.
 */
export function previewFallback(ctx: ValidateContext, language: string): PreviewFallback | null {
  if (!ctx.sourceUrl || !hasPreviewDetails(ctx)) return null;
  const preview = ctx.linkPreview;
  const raw: ProposeCardInput = {
    type: 'link',
    title: preview?.title || hostOf(ctx.sourceUrl),
    body: preview?.description ?? '',
    link: { url: ctx.sourceUrl },
    categoryIds: [],
    language,
    confidence: 0,
  };
  const validated = validateProposal(raw, ctx);
  if (!validated.ok) return null;
  return {
    item: validated.item,
    summary: { ...validated.summary, escalated: false, fallback: 'preview' },
  };
}

/**
 * D355: logs the fallback decision with ids, the closed-set reason and, for an unusable answer,
 * what it got wrong (`failureDetail`: zod paths or fixed extractor messages, never content).
 */
export function logPreviewFallback(
  log: Pick<Logger, 'warn'>,
  ids: { jobId: string; deckId: string; itemId: string },
  reason: IngestFailureCode,
  detail?: string,
): void {
  log.warn(
    {
      event: PREVIEW_FALLBACK_EVENT,
      outcome: 'proposed',
      reason,
      ...ids,
      ...(detail ? { detail } : {}),
    },
    'extraction failed, proposed from the page preview',
  );
}
