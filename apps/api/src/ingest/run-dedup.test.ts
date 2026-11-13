import { describe, expect, it, vi } from 'vitest';
import type { DedupRepo } from '../repositories/dedup.repo';
import { runDedup, type RunDedupInput } from './run-dedup';

function fakeRepo(overrides: Partial<DedupRepo> = {}): DedupRepo {
  return {
    sourceUrlCandidates: vi.fn(async () => []),
    nearest: vi.fn(async () => null),
    titleMatch: vi.fn(async () => null),
    eventCandidates: vi.fn(async () => []),
    mediaFileMatch: vi.fn(async () => null),
    ...overrides,
  };
}

const input: RunDedupInput = {
  itemId: 'draft',
  deckId: 'deck',
  title: 'Dan the Plumber',
  sourceUrl: null,
  jobId: 'job',
  userId: 'user',
};

function run(dedup: DedupRepo, overrides: Partial<RunDedupInput> = {}) {
  return runDedup(
    {
      dedup,
      embedder: null,
      embeddings: { loadForEmbedding: vi.fn(), saveEmbedding: vi.fn() },
      llmCalls: { insert: vi.fn() } as never,
      log: () => undefined,
    },
    { ...input, ...overrides },
  );
}

describe('runDedup', () => {
  it('skips the URL lookup without a source URL or with an unparsable one', async () => {
    const repo = fakeRepo();
    await run(repo);
    await run(repo, { sourceUrl: 'not a url' });
    expect(repo.sourceUrlCandidates).not.toHaveBeenCalled();
  });

  it('looks up candidates by host and compares normalized URLs', async () => {
    const repo = fakeRepo({
      sourceUrlCandidates: vi.fn(async () => [
        { id: 'other', sourceUrl: 'https://dan.example/other' },
        { id: 'same', sourceUrl: 'https://dan.example/plumber/?utm_medium=x#a' },
      ]),
    });
    const verdict = await run(repo, { sourceUrl: 'https://dan.example/plumber?fbclid=1' });

    expect(repo.sourceUrlCandidates).toHaveBeenCalledWith('deck', 'draft', 'dan.example');
    expect(verdict).toEqual({
      action: 'update',
      itemId: 'same',
      similarity: null,
      via: 'source_url',
    });
  });

  it('uses the title match when there is no embedder', async () => {
    const repo = fakeRepo({
      titleMatch: vi.fn(async () => ({ itemId: 'dan', similarity: 0.9 })),
    });
    expect(await run(repo)).toMatchObject({ action: 'possible_duplicate', itemId: 'dan' });
    expect(repo.nearest).not.toHaveBeenCalled();
  });

  it('compares an event with same-day events only, by link then title (D376)', async () => {
    const repo = fakeRepo({
      eventCandidates: vi.fn(async () => [
        { id: 'e1', title: 'Winter fair', url: 'https://fair.example/winter', sourceUrl: null },
      ]),
    });
    const verdict = await run(repo, {
      type: 'event',
      title: 'Winter fair',
      url: 'https://fair.example/winter',
      sourceUrl: 'https://fair.example/winter',
    });
    expect(repo.eventCandidates).toHaveBeenCalledWith('deck', 'draft');
    expect(repo.sourceUrlCandidates).not.toHaveBeenCalled();
    expect(repo.titleMatch).not.toHaveBeenCalled();
    expect(verdict).toEqual({
      action: 'possible_duplicate',
      itemId: 'e1',
      similarity: null,
      via: 'source_url',
    });
  });
});

describe('runDedup media files (D396)', () => {
  it('flags the same file as a possible duplicate before any other signal', async () => {
    const repo = fakeRepo({
      mediaFileMatch: vi.fn(async () => 'm1'),
      titleMatch: vi.fn(async () => ({ itemId: 't1', similarity: 1 })),
    });
    const verdict = await run(repo, { type: 'media', filePublicIds: ['p1', 'p2'] });
    expect(repo.mediaFileMatch).toHaveBeenCalledWith('deck', 'draft', ['p1', 'p2']);
    expect(repo.titleMatch).not.toHaveBeenCalled();
    expect(verdict).toEqual({
      action: 'possible_duplicate',
      itemId: 'm1',
      similarity: null,
      via: 'file',
    });
  });

  it('falls through to the usual signals when no file matches', async () => {
    const repo = fakeRepo();
    const verdict = await run(repo, { type: 'media', filePublicIds: ['p1'] });
    expect(repo.titleMatch).toHaveBeenCalled();
    expect(verdict.via).not.toBe('file');
  });
});
