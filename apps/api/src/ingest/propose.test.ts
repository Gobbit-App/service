import { describe, expect, it, vi } from 'vitest';
import { explicitVerdict } from './dedup-verdict';
import { proposeItem, sourceKindFor, type ProposeDeps, type ProposeInput } from './propose';

const NOW = new Date('2026-01-01T00:00:00Z');

function makeFakes() {
  const findDefault = vi.fn(async (_deckId: string) => ({ id: 'cat-default' }));
  const create = vi.fn(async (row: { title: string; sourceUrl: string | null }) => ({
    ...row,
    id: 'item1',
  }));
  const update = vi.fn(async () => undefined);
  const enqueueIfStale = vi.fn(async () => undefined);
  const log = vi.fn();
  return { findDefault, create, update, enqueueIfStale, log };
}

type Fakes = ReturnType<typeof makeFakes>;

function makeDeps(f: Fakes, extra: Record<string, unknown> = {}): ProposeDeps {
  return {
    categories: { findDefault: f.findDefault },
    items: { create: f.create },
    jobs: { update: f.update },
    embedQueue: { enqueueIfStale: f.enqueueIfStale },
    now: () => NOW,
    log: f.log,
    ...extra,
  } as unknown as ProposeDeps;
}

const job: ProposeInput['job'] = { id: 'job1', deckId: 'd1', userId: 'u1', channel: 'pwa' };
const item = {
  type: 'text',
  title: 'Soup',
  body: 'Hot',
  payload: {},
  sourceUrl: 'https://ex.com/a',
} as ProposeInput['item'];

function summaryWith(categoryIds: string[]): ProposeInput['summary'] {
  return {
    model: 'm',
    escalated: false,
    type: 'text',
    confidence: 0.9,
    language: 'en',
    categoryIds,
    newCategory: null,
  } as ProposeInput['summary'];
}

function inputWith(categoryIds: string[], extra: Partial<ProposeInput> = {}): ProposeInput {
  return { job, item, summary: summaryWith(categoryIds), ...extra };
}

describe('propose (D103/D109)', () => {
  it('sourceKindFor maps channels to source kinds', () => {
    expect(sourceKindFor('email')).toBe('email');
    expect(sourceKindFor('mcp')).toBe('mcp');
    expect(sourceKindFor('import')).toBe('import');
    expect(sourceKindFor('pwa')).toBe('share');
    expect(sourceKindFor('shortcut')).toBe('share');
    expect(sourceKindFor('paste')).toBe('share');
  });

  it('explicitVerdict names the updated card with no similarity', () => {
    expect(explicitVerdict('i9')).toEqual({
      action: 'update',
      itemId: 'i9',
      similarity: null,
      via: 'explicit',
    });
  });

  it('creates a proposed item by the sharer when categories are given', async () => {
    const f = makeFakes();
    await proposeItem(makeDeps(f), inputWith(['c1']));

    expect(f.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'proposed',
        sourceKind: 'share',
        createdBy: 'u1',
        verifiedAt: null,
        entities: {},
      }),
      ['c1'],
      [expect.objectContaining({ kind: 'proposed', via: 'ingest', actorUserId: 'u1' })],
    );
    expect(f.findDefault).not.toHaveBeenCalled();
  });

  it('falls back to the default category when none fit', async () => {
    const f = makeFakes();
    await proposeItem(makeDeps(f), inputWith([]));

    expect(f.findDefault).toHaveBeenCalledWith('d1');
    expect(f.create).toHaveBeenCalledWith(expect.anything(), ['cat-default'], expect.any(Array));
    expect(f.update).toHaveBeenCalledWith(
      'job1',
      expect.objectContaining({
        extraction: expect.objectContaining({ categoryIds: ['cat-default'] }),
      }),
    );
  });

  it('returns the dedup verdict from the dedup dep', async () => {
    const f = makeFakes();
    const verdict = { action: 'new', itemId: null, similarity: null, via: 'none' } as const;
    const dedup = vi.fn(async () => verdict);
    const result = await proposeItem(makeDeps(f, { dedup }), inputWith(['c1']));

    expect(result.dedup).toEqual(verdict);
    expect(dedup).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item1',
        deckId: 'd1',
        title: 'Soup',
        sourceUrl: 'https://ex.com/a',
        jobId: 'job1',
        userId: 'u1',
      }),
    );
  });

  it('skips similarity search for a targeted proposal', async () => {
    const f = makeFakes();
    const dedup = vi.fn(async () => ({
      action: 'new',
      itemId: null,
      similarity: null,
      via: 'none',
    }));
    const result = await proposeItem(
      makeDeps(f, { dedup }),
      inputWith(['c1'], { targetItemId: 't1' }),
    );

    expect(dedup).not.toHaveBeenCalled();
    expect(result.dedup).toEqual(explicitVerdict('t1'));
  });

  it('degrades to a null verdict when dedup fails and still returns the proposal', async () => {
    const f = makeFakes();
    const dedup = vi.fn(async () => {
      throw new Error('boom');
    });
    const result = await proposeItem(makeDeps(f, { dedup }), inputWith(['c1']));

    expect(result.dedup).toBeNull();
    expect(f.log).toHaveBeenCalledWith(expect.stringContaining('job1'));
    expect(result.item.id).toBe('item1');
  });

  it('returns a null verdict when no dedup dep is configured', async () => {
    const f = makeFakes();
    const result = await proposeItem(makeDeps(f), inputWith(['c1']));

    expect(result.dedup).toBeNull();
  });

  it('marks the job proposed and enqueues embedding', async () => {
    const f = makeFakes();
    await proposeItem(makeDeps(f), inputWith(['c1']));

    expect(f.update).toHaveBeenCalledWith(
      'job1',
      expect.objectContaining({
        status: 'proposed',
        resultItemId: 'item1',
        error: null,
        finishedAt: NOW,
      }),
    );
    expect(f.enqueueIfStale).toHaveBeenCalledWith('item1');
  });

  it('records the mcp source kind for direct AI proposals', async () => {
    const f = makeFakes();
    await proposeItem(makeDeps(f), inputWith(['c1'], { job: { ...job, channel: 'mcp' } }));

    expect(f.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKind: 'mcp' }),
      ['c1'],
      expect.any(Array),
    );
  });
});
