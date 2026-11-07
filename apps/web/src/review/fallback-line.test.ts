import { describe, expect, it } from 'vitest';
import type { ReviewEntry } from '@gobbit/shared';
import { fallbackLine } from './fallback-line';

type ReviewJob = NonNullable<ReviewEntry['job']>;
const job = (extractionFallback: ReviewJob['extractionFallback']) =>
  ({ extractionFallback }) as ReviewJob;

describe('fallbackLine (D355)', () => {
  it('explains a proposal filled in from the page preview', () => {
    expect(fallbackLine(job('preview'))).toMatch(/^The assistant couldn't read this share/);
  });

  it('says nothing for an ordinary proposal', () => {
    expect(fallbackLine(job(null))).toBeNull();
    expect(fallbackLine(null)).toBeNull();
  });
});
