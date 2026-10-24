import { describe, expect, it } from 'vitest';
import type { ReviewEntry } from '@pb/shared';
import { makeItem } from '../test/fixtures';
import { bulkPublishSummary, publishedMessage } from './bulk-publish-summary';

const entry = (id: string, title: string): ReviewEntry => ({
  item: makeItem({ id, title, status: 'proposed' }),
  job: null,
  target: null,
});

describe('bulkPublishSummary (D191)', () => {
  it('counts published cards and names skipped ones with their reason', () => {
    const summary = bulkPublishSummary(
      {
        published: ['a'],
        skipped: [
          { id: 'b', reason: 'needs-decision' },
          { id: 'gone', reason: 'already-handled' },
        ],
      },
      [entry('a', 'Clinic'), entry('b', 'Pharmacy')],
    );

    expect(summary).toEqual({
      published: 1,
      skipped: [
        { id: 'b', title: 'Pharmacy', reason: 'needs a decision' },
        { id: 'gone', title: 'A card', reason: 'already handled' },
      ],
    });
  });
});

describe('publishedMessage', () => {
  it('uses singular and plural', () => {
    expect(publishedMessage(1)).toBe('Published 1 card');
    expect(publishedMessage(3)).toBe('Published 3 cards');
  });
});
