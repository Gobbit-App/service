import type { IngestJobRow, ItemRow } from '@pb/db';
import type { DedupVerdict, Entities } from '@pb/shared';

/** Characters of shared text shown as the source line when no URL was shared. */
export const SOURCE_PREVIEW_CHARS = 140;

/** D106: the shared URL, else the start of the shared text, else null (raw pruned after 30 days). */
export function sourcePreview(job: Pick<IngestJobRow, 'raw' | 'normalized'>): string | null {
  const url = job.raw?.url ?? job.normalized?.url;
  if (url) return url;
  const text = (job.raw?.text ?? job.normalized?.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const chars = [...text];
  return chars.length > SOURCE_PREVIEW_CHARS
    ? `${chars.slice(0, SOURCE_PREVIEW_CHARS - 1).join('')}…`
    : text;
}

/** The item a verdict points at, unless the verdict says the proposal is new. */
export function dedupTargetId(dedup: DedupVerdict | null | undefined): string | null {
  if (!dedup || dedup.action === 'new') return null;
  return dedup.itemId;
}

export interface MergePatch {
  title: string;
  body: string;
  entities: Entities;
  sourceUrl: string | null;
  status: 'published';
  verifiedAt: Date;
  payload?: Record<string, unknown>;
}

/**
 * D106 "apply update": the proposal's fields replace the target's. Types are immutable (D12), so
 * the payload is copied only when both cards have the same type; a missing source URL keeps the
 * target's.
 */
export function mergeProposalPatch(
  proposal: Pick<ItemRow, 'type' | 'title' | 'body' | 'payload' | 'entities' | 'sourceUrl'>,
  target: Pick<ItemRow, 'type' | 'sourceUrl'>,
  now: Date,
): MergePatch {
  return {
    title: proposal.title,
    body: proposal.body,
    entities: proposal.entities,
    sourceUrl: proposal.sourceUrl ?? target.sourceUrl,
    status: 'published',
    verifiedAt: now,
    ...(proposal.type === target.type ? { payload: proposal.payload } : {}),
  };
}
