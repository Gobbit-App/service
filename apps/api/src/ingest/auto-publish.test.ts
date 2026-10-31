import { describe, expect, it, vi } from 'vitest';
import type { DeckRow, ItemRow } from '@gobbit/db';
import type { DedupVerdict, IngestChannel, MemberRole } from '@gobbit/shared';
import { autoPublish, autoPublishHold, type AutoPublishDeps } from './auto-publish';

const fresh: DedupVerdict = { action: 'new', itemId: null, similarity: null, via: 'none' };
const proposal = { id: 'item1', deckId: 'd1', status: 'proposed' } as ItemRow;

function makeDeps(
  opts: { setting?: boolean; role?: MemberRole | null; publishError?: Error } = {},
) {
  const deps = {
    decks: {
      findById: vi.fn(
        async () => ({ id: 'd1', autoPublishShares: opts.setting ?? true }) as DeckRow,
      ),
    },
    roleOf: vi.fn(async () => (opts.role === undefined ? 'owner' : opts.role)),
    publishProposal: vi.fn(async () => {
      if (opts.publishError) throw opts.publishError;
      return 'item1';
    }),
    jobs: { update: vi.fn(async () => undefined) },
    embedQueue: { enqueueIfStale: vi.fn(async () => undefined) },
    linkSnapshotQueue: { enqueueIfNeeded: vi.fn(async () => undefined) },
    logger: { warn: vi.fn() },
  };
  return deps as typeof deps & AutoPublishDeps;
}

function input(
  extra: { channel?: IngestChannel; categoryIds?: string[]; verdict?: DedupVerdict | null } = {},
) {
  return {
    job: { id: 'job1', deckId: 'd1', userId: 'u1', channel: extra.channel ?? 'pwa' },
    proposal,
    categoryIds: extra.categoryIds ?? ['cat1'],
    verdict: extra.verdict === undefined ? fresh : extra.verdict,
  };
}

describe('autoPublishHold (D193)', () => {
  const base = { role: 'owner' as MemberRole, categoryIds: ['c1'], verdict: fresh };

  it.each(['owner', 'maintainer'] as const)('lets a %s through', (role) => {
    expect(autoPublishHold({ ...base, role })).toBeNull();
  });

  it.each(['editor', 'reader', null] as const)('holds a %s as not a publisher', (role) => {
    expect(autoPublishHold({ ...base, role })).toBe('held_not_publisher');
  });

  it('holds a share with no chosen category', () => {
    expect(autoPublishHold({ ...base, categoryIds: [] })).toBe('held_needs_category');
  });

  it.each(['possible_duplicate', 'update'] as const)('holds a %s verdict', (action) => {
    expect(autoPublishHold({ ...base, verdict: { ...fresh, action } })).toBe('held_duplicate');
  });

  it('holds when the duplicate check failed', () => {
    expect(autoPublishHold({ ...base, verdict: null })).toBe('held_duplicate_check_failed');
  });

  it('checks rights before category before duplicates', () => {
    expect(autoPublishHold({ role: 'editor', categoryIds: [], verdict: null })).toBe(
      'held_not_publisher',
    );
    expect(autoPublishHold({ ...base, categoryIds: [], verdict: null })).toBe(
      'held_needs_category',
    );
  });
});

describe('autoPublish (D193)', () => {
  it('publishes as the sharer via ingest and records the outcome in the same commit', async () => {
    const deps = makeDeps();
    expect(await autoPublish(deps, input())).toBe('published');
    expect(deps.publishProposal).toHaveBeenCalledWith({
      item: proposal,
      jobId: 'job1',
      event: { kind: 'published', via: 'ingest', actorUserId: 'u1' },
      reviewerId: 'u1',
      autoPublish: 'published',
    });
    expect(deps.jobs.update).not.toHaveBeenCalled();
    expect(deps.embedQueue.enqueueIfStale).toHaveBeenCalledWith('item1');
    expect(deps.linkSnapshotQueue.enqueueIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item1', status: 'published' }),
    );
  });

  it('does nothing with the setting off', async () => {
    const deps = makeDeps({ setting: false });
    expect(await autoPublish(deps, input())).toBeNull();
    expect(deps.jobs.update).not.toHaveBeenCalled();
    expect(deps.publishProposal).not.toHaveBeenCalled();
  });

  it.each(['mcp', 'import'] as const)('does nothing for %s', async (channel) => {
    const deps = makeDeps();
    expect(await autoPublish(deps, input({ channel }))).toBeNull();
    expect(deps.decks.findById).not.toHaveBeenCalled();
  });

  it('records a hold and leaves the proposal in review', async () => {
    const deps = makeDeps({ role: 'editor' });
    expect(await autoPublish(deps, input())).toBe('held_not_publisher');
    expect(deps.jobs.update).toHaveBeenCalledWith('job1', { autoPublish: 'held_not_publisher' });
    expect(deps.publishProposal).not.toHaveBeenCalled();
  });

  it('holds a sharer who left the deck', async () => {
    const deps = makeDeps({ role: null });
    expect(await autoPublish(deps, input())).toBe('held_not_publisher');
  });

  it('records held_publish_failed and logs a warning without throwing', async () => {
    const deps = makeDeps({ publishError: new Error('D95 https://example.test/secret') });
    expect(await autoPublish(deps, input())).toBe('held_publish_failed');
    expect(deps.jobs.update).toHaveBeenCalledWith('job1', { autoPublish: 'held_publish_failed' });
    expect(deps.logger.warn).toHaveBeenCalledWith(
      { jobId: 'job1', deckId: 'd1', err: 'Error' },
      'ingest auto-publish failed, left in review',
    );
    expect(JSON.stringify(deps.logger.warn.mock.calls)).not.toContain('example.test');
    expect(deps.embedQueue.enqueueIfStale).not.toHaveBeenCalled();
  });

  it('still reports published when a follow-up enqueue fails', async () => {
    const deps = makeDeps();
    deps.embedQueue.enqueueIfStale.mockRejectedValueOnce(new Error('queue down'));
    expect(await autoPublish(deps, input())).toBe('published');
    expect(deps.logger.warn).toHaveBeenCalledTimes(1);
  });
});
