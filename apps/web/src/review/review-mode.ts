import type { ReviewEntry } from '@gobbit/shared';

/** How the review card presents a proposal (D106). */
export type ReviewMode =
  { kind: 'new' } | { kind: 'duplicate' | 'update'; target: NonNullable<ReviewEntry['target']> };

/**
 * `update` / `possible_duplicate` verdicts offer "Apply update" only while their target is still
 * visible; otherwise the proposal is treated as new.
 */
export function reviewMode(entry: ReviewEntry): ReviewMode {
  const action = entry.job?.dedup?.action;
  if (!entry.target || !action || action === 'new') return { kind: 'new' };
  return { kind: action === 'update' ? 'update' : 'duplicate', target: entry.target };
}

/** The suggested category, offered only to roles that may create one. */
export function suggestedCategory(entry: ReviewEntry, canCreate: boolean): string | null {
  const name = entry.job?.newCategory?.trim();
  return canCreate && name ? name : null;
}
