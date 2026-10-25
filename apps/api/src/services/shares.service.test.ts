import type { IngestJobRow } from '@pb/db';
import type { ShareChannel } from '@pb/shared';
import { describe, expect, it } from 'vitest';
import { canRetryJob, toShareSummary, type ShareItemRef } from './shares.service';

const created = new Date('2026-10-25T10:00:00.000Z');

function job(overrides: Partial<IngestJobRow> = {}): IngestJobRow & { channel: ShareChannel } {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    deckId: '33333333-3333-4333-8333-333333333333',
    channel: 'pwa',
    clientLabel: null,
    status: 'queued',
    raw: { text: 'secret note text', images: [] },
    normalized: null,
    extraction: null,
    dedup: null,
    resultItemId: null,
    error: null,
    failureCode: null,
    autoPublish: null,
    attempts: 0,
    retryCount: 0,
    retriedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    finishedAt: null,
    createdAt: created,
    updatedAt: created,
    ...overrides,
  } as IngestJobRow & { channel: ShareChannel };
}

const card: ShareItemRef = { id: 'item-1', title: 'Dentist', deletedAt: null };

describe('toShareSummary (D196)', () => {
  it.each([
    ['queued', 'processing'],
    ['running', 'processing'],
    ['proposed', 'in_review'],
    ['published', 'published'],
    ['discarded', 'not_added'],
    ['failed', 'failed'],
  ] as const)('maps status %s to state %s', (status, state) => {
    expect(toShareSummary(job({ status }), null, null).state).toBe(state);
  });

  it('takes the title from the card first, then the page title the share carried', () => {
    const withTitle = job({ raw: { title: 'Page title', images: [] } });
    expect(toShareSummary(withTitle, card, null).preview.title).toBe('Dentist');
    expect(toShareSummary(withTitle, null, null).preview.title).toBe('Page title');
  });

  it('shows the host and photo count but never the shared text or stored error', () => {
    const summary = toShareSummary(
      job({
        status: 'failed',
        failureCode: 'image_unavailable',
        error: 'error: could not fetch https://res.example/x.jpg',
        raw: {
          text: 'secret note text',
          url: 'https://dentist.example/about?x=1',
          images: [{ publicId: 'gobbit/ingest/a', bytes: 10, mime: 'image/jpeg' }],
        },
      }),
      null,
      null,
    );
    expect(summary.preview).toEqual({ title: null, host: 'dentist.example', photoCount: 1 });
    const json = JSON.stringify(summary);
    expect(json).not.toContain('secret note text');
    expect(json).not.toContain('res.example');
  });

  it('ignores a URL that does not parse', () => {
    expect(
      toShareSummary(job({ raw: { url: 'not a url', images: [] } }), null, null).preview.host,
    ).toBeNull();
  });

  it('reports failed rows without a code as unknown, and other rows without a code', () => {
    expect(toShareSummary(job({ status: 'failed' }), null, null).failureCode).toBe('unknown');
    expect(
      toShareSummary(job({ status: 'proposed', failureCode: null }), null, null).failureCode,
    ).toBeNull();
  });

  it('marks a soft-deleted card', () => {
    const deleted = { ...card, deletedAt: new Date() };
    expect(toShareSummary(job({ status: 'published' }), deleted, null).item).toEqual({
      id: 'item-1',
      title: 'Dentist',
      deleted: true,
    });
  });

  it('names who reviewed it and when', () => {
    const reviewedAt = new Date('2026-10-25T11:00:00.000Z');
    const summary = toShareSummary(
      job({ status: 'discarded', reviewedBy: 'u-9', reviewedAt }),
      null,
      'Dana',
    );
    expect(summary.reviewedBy).toEqual({ displayName: 'Dana' });
    expect(summary.reviewedAt).toBe(reviewedAt.toISOString());
  });

  it('passes the auto-publish outcome through', () => {
    expect(
      toShareSummary(job({ status: 'proposed', autoPublish: 'held_duplicate' }), null, null)
        .autoPublish,
    ).toBe('held_duplicate');
  });
});

describe('canRetryJob (D197)', () => {
  const failed = job({ status: 'failed', failureCode: 'assistant_unavailable' });

  it('allows a failed share with its copy and retries left', () => {
    expect(canRetryJob(failed)).toBe(true);
  });

  it('refuses when not failed, the copy is gone or the limit is reached', () => {
    expect(canRetryJob({ ...failed, status: 'proposed' })).toBe(false);
    expect(canRetryJob({ ...failed, raw: null })).toBe(false);
    expect(canRetryJob({ ...failed, retryCount: 3 })).toBe(false);
  });

  it.each(['sharer_left', 'content_expired'] as const)('refuses %s', (failureCode) => {
    expect(canRetryJob({ ...failed, failureCode })).toBe(false);
  });
});
