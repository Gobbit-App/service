import type { IngestJob, IngestToken } from '@pb/shared';
import type { IngestJobRow, IngestTokenRow } from '@pb/db';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** D109: the debug view of a job; `costUsd` is Σ llm_calls for it. */
export function toIngestJobDto(r: IngestJobRow, costUsd: number): IngestJob {
  return {
    id: r.id,
    deckId: r.deckId,
    userId: r.userId,
    channel: r.channel,
    clientLabel: r.clientLabel ?? null,
    status: r.status,
    raw: r.raw ?? null,
    normalized: r.normalized ?? null,
    extraction: r.extraction ?? null,
    dedup: r.dedup ?? null,
    resultItemId: r.resultItemId,
    error: r.error,
    failureCode: r.failureCode ?? null,
    autoPublish: r.autoPublish ?? null,
    attempts: r.attempts,
    retryCount: r.retryCount,
    costUsd,
    reviewedBy: r.reviewedBy,
    reviewedAt: iso(r.reviewedAt),
    finishedAt: iso(r.finishedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** D99: never includes the hash or the plain token. */
export function toIngestTokenDto(r: IngestTokenRow): IngestToken {
  return {
    id: r.id,
    label: r.label,
    prefix: r.prefix,
    deckId: r.deckId,
    lastUsedAt: iso(r.lastUsedAt),
    createdAt: r.createdAt.toISOString(),
  };
}
