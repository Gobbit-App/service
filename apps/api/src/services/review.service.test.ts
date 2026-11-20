import type { IngestJobRow } from '@gobbit/db';
import { describe, expect, it } from 'vitest';
import type { CurrentUser } from '../types';
import { createReviewService } from './review.service';

const user: CurrentUser = { id: 'u1', accountId: 'a1', email: 'a@example.com', displayName: 'A' };
const deck = { id: 'd1', ownerAccountId: 'a1', slug: 'home' };
const created = new Date('2026-10-25T10:00:00.000Z');

/** The list path only reads the deck, the proposal rows, their jobs and the DTO mapper. */
function listWith(extraction: IngestJobRow['extraction']) {
  const job = {
    id: 'j1',
    userId: null,
    channel: 'pwa',
    clientLabel: null,
    createdAt: created,
    dedup: null,
    raw: { text: 'hi', images: [] },
    normalized: null,
    autoPublish: null,
    resultItemId: 'i1',
    extraction,
  } as unknown as IngestJobRow;
  const service = createReviewService({
    decks: { findById: async () => deck, findBySlug: async () => deck },
    memberships: { findActive: async () => null },
    users: { findById: async () => null },
    summaries: { summaries: async () => new Map() },
    items: {
      list: async () => [{ id: 'i1' }],
      countByStatus: async () => 1,
      findById: async () => null,
    },
    jobs: { findByResultItems: async () => [job], findByResultItem: async () => job },
    toDtos: async (_u: unknown, rows: { id: string }[]) => rows,
    now: () => created,
  } as never);
  return service.list(user, 'home').then((r) => r.data[0]!.job!);
}

describe('review list: smart-share extraction flags (FR-010)', () => {
  it('maps the no_smart_share fallback', async () => {
    const job = await listWith({ fallback: 'no_smart_share' } as never);
    expect(job.extractionFallback).toBe('no_smart_share');
  });

  it('maps bodyCut true only when the extraction says so', async () => {
    expect((await listWith({ bodyCut: true } as never)).extractionBodyCut).toBe(true);
    expect((await listWith({ bodyCut: false } as never)).extractionBodyCut).toBe(false);
    expect((await listWith(null)).extractionBodyCut).toBe(false);
  });
});
