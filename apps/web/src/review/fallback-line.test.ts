import { describe, expect, it } from 'vitest';
import type { ReviewEntry } from '@gobbit/shared';
import { fallbackLine } from './fallback-line';

type ReviewJob = NonNullable<ReviewEntry['job']>;
const job = (extractionFallback: ReviewJob['extractionFallback'], extractionBodyCut = false) =>
  ({ extractionFallback, extractionBodyCut }) as ReviewJob;

describe('fallbackLine (D355)', () => {
  it('explains a proposal filled in from the page preview', () => {
    expect(fallbackLine(job('preview'))).toMatch(/^The assistant couldn't read this share/);
  });

  it('says nothing for an ordinary proposal', () => {
    expect(fallbackLine(job(null))).toBeNull();
    expect(fallbackLine(null)).toBeNull();
  });

  it('explains a share saved as sent without smart share', () => {
    expect(fallbackLine(job('no_smart_share'))).toBe(
      'Saved as the sharer sent it, without smart share. Check it before publishing.',
    );
  });

  it('adds the cut note when the text was cut at the limit', () => {
    expect(fallbackLine(job('no_smart_share', true))).toBe(
      'Saved as the sharer sent it, without smart share. Check it before publishing. The text was cut at the limit.',
    );
  });
});
