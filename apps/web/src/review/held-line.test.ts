import { describe, expect, it } from 'vitest';
import { autoPublishOutcomes } from '@pb/shared/ingest-constants';
import type { ReviewEntry } from '@pb/shared';
import { heldLine } from './held-line';

type ReviewJob = NonNullable<ReviewEntry['job']>;
const job = (autoPublish: ReviewJob['autoPublish']) => ({ autoPublish }) as ReviewJob;

describe('heldLine (D193)', () => {
  it.each(autoPublishOutcomes.filter((o) => o !== 'published'))('explains %s', (outcome) => {
    expect(heldLine(job(outcome))).toMatch(/^Not published directly: \S/);
  });

  it('says nothing without a held outcome', () => {
    expect(heldLine(job(null))).toBeNull();
    expect(heldLine(job('published'))).toBeNull();
    expect(heldLine(null)).toBeNull();
  });

  it('names the category case', () => {
    expect(heldLine(job('held_needs_category'))).toBe(
      'Not published directly: it needs a category',
    );
  });
});
