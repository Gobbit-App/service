import type { BulkPublishResult, BulkPublishSkipReason, ReviewEntry } from '@gobbit/shared';

const SKIP_LABELS: Record<BulkPublishSkipReason, string> = {
  'needs-decision': 'needs a decision',
  'already-handled': 'already handled',
};

export type SkippedCard = { id: string; title: string; reason: string };

export type BulkPublishSummary = { published: number; skipped: SkippedCard[] };

/** D191: what a bulk publish did, with skipped cards named by the titles the queue showed. */
export function bulkPublishSummary(
  result: BulkPublishResult,
  entries: readonly ReviewEntry[],
): BulkPublishSummary {
  const titles = new Map(entries.map((entry) => [entry.item.id, entry.item.title]));
  return {
    published: result.published.length,
    skipped: result.skipped.map(({ id, reason }) => ({
      id,
      title: titles.get(id) ?? 'A card',
      reason: SKIP_LABELS[reason],
    })),
  };
}

/** "Published 3 cards" / "Published 1 card"; skipped ones are listed separately. */
export function publishedMessage(count: number): string {
  return `Published ${count} ${count === 1 ? 'card' : 'cards'}`;
}
