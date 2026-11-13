import type { ReviewEntry } from '@gobbit/shared';

/**
 * D355: the reviewer's note on a proposal the assistant couldn't read, filled in from the shared
 * page's preview instead; null for an ordinary proposal.
 */
export function fallbackLine(job: ReviewEntry['job']): string | null {
  if (job?.extractionFallback !== 'preview') return null;
  return "The assistant couldn't read this share; filled in from the page preview. Check it before publishing.";
}
