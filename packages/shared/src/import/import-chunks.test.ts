import { describe, expect, it, vi } from 'vitest';
import { importInChunks, type ImportRunResult, type SendImportChunk } from './import-chunks';
import type { ImportRowDraft } from './to-draft';

const drafts = (n: number): ImportRowDraft[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'text', title: `Note ${i}`, body: '' }));

const ok = (rows: ImportRowDraft[]): ImportRunResult => ({
  imported: rows.length,
  duplicates: 0,
  failed: [],
});

describe('importInChunks (D190)', () => {
  it('sends chunks in order and adds the results up', async () => {
    const send = vi.fn<SendImportChunk>(async (rows) => ({
      ...ok(rows),
      duplicates: 1,
      failed: [{ index: 0, problem: '/problems/conflict' }],
    }));

    const result = await importInChunks(drafts(5), send, { chunkSize: 2 });

    expect(send.mock.calls.map(([rows]) => rows.map((r) => r.title))).toEqual([
      ['Note 0', 'Note 1'],
      ['Note 2', 'Note 3'],
      ['Note 4'],
    ]);
    expect(result.imported).toBe(5);
    expect(result.duplicates).toBe(3);
    // Chunk indexes become indexes into the whole import.
    expect(result.failed.map((f) => f.index)).toEqual([0, 2, 4]);
  });

  it('stops after a cap hit and reports the unsent rows rate limited', async () => {
    const send = vi.fn<SendImportChunk>(async () => ({
      imported: 1,
      duplicates: 0,
      failed: [{ index: 1, problem: '/problems/rate-limited', detail: 'Daily limit' }],
    }));

    const result = await importInChunks(drafts(5), send, { chunkSize: 2 });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.failed).toEqual(
      [1, 2, 3, 4].map((index) => ({
        index,
        problem: '/problems/rate-limited',
        detail: 'Daily limit',
      })),
    );
  });

  it('rethrows when the first request fails, nothing being imported', async () => {
    const send = vi.fn<SendImportChunk>(async () => {
      throw new Error('429');
    });
    await expect(importInChunks(drafts(3), send, { chunkSize: 2 })).rejects.toThrow('429');
  });

  it('reports the rest failed when a later request fails', async () => {
    const send = vi
      .fn<SendImportChunk>()
      .mockImplementationOnce(async (rows) => ok(rows))
      .mockRejectedValueOnce(new Error('offline'));

    const result = await importInChunks(drafts(3), send, {
      chunkSize: 2,
      describeError: (err) => ({ problem: '/problems/x', detail: (err as Error).message }),
    });

    expect(result).toEqual({
      imported: 2,
      duplicates: 0,
      failed: [{ index: 2, problem: '/problems/x', detail: 'offline' }],
    });
  });
});
