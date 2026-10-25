import { describe, it, expect } from 'vitest';
import { shareListSchema, shareSummarySchema } from './share';

const validShare = {
  id: '11111111-1111-4111-8111-111111111111',
  deckId: '22222222-2222-4222-8222-222222222222',
  channel: 'pwa',
  createdAt: '2026-10-25T10:00:00.000Z',
  state: 'failed',
  preview: { title: null, host: null, photoCount: 1 },
  failureCode: 'image_unavailable',
  canRetry: true,
  autoPublish: null,
  item: null,
  reviewedBy: null,
  reviewedAt: null,
};

describe('shareSummarySchema (D196)', () => {
  it('accepts a failed photo share', () => {
    expect(shareSummarySchema.safeParse(validShare).success).toBe(true);
  });

  it('accepts a published share with its card', () => {
    const published = {
      ...validShare,
      state: 'published',
      failureCode: null,
      canRetry: false,
      autoPublish: 'published',
      item: { id: '33333333-3333-4333-8333-333333333333', title: 'Dentist', deleted: false },
    };
    expect(shareSummarySchema.safeParse(published).success).toBe(true);
  });

  it('rejects the stored error text (strict)', () => {
    expect(shareSummarySchema.safeParse({ ...validShare, error: 'error: boom' }).success).toBe(
      false,
    );
  });

  it('rejects channels that are not shares', () => {
    expect(shareSummarySchema.safeParse({ ...validShare, channel: 'mcp' }).success).toBe(false);
    expect(shareSummarySchema.safeParse({ ...validShare, channel: 'import' }).success).toBe(false);
  });

  it('rejects unknown failure codes', () => {
    expect(shareSummarySchema.safeParse({ ...validShare, failureCode: 'boom' }).success).toBe(
      false,
    );
  });
});

describe('shareListSchema', () => {
  it('wraps shares', () => {
    expect(shareListSchema.safeParse({ shares: [validShare] }).success).toBe(true);
  });
});
