import type { AutoPublishOutcome, ReviewEntry } from '@pb/shared';

type HeldOutcome = Exclude<AutoPublishOutcome, 'published'>;

/** D193: the reviewer's view of why a publisher's share was not published directly. */
const HELD_REASON: Readonly<Record<HeldOutcome, string>> = {
  held_not_publisher: "the sharer can't publish here",
  held_needs_category: 'it needs a category',
  held_duplicate: 'it may be a duplicate',
  held_duplicate_check_failed: "the duplicate check didn't finish",
  held_publish_failed: 'publishing failed',
};

/** FR-011: "Not published directly: <reason>" for a held share; null otherwise. */
export function heldLine(job: ReviewEntry['job']): string | null {
  const outcome = job?.autoPublish;
  if (!outcome || outcome === 'published') return null;
  return `Not published directly: ${HELD_REASON[outcome]}`;
}
