import type { IngestJobRow } from '@pb/db';
import { INGEST_JOB_RETRIES } from '@pb/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runExtraction = vi.fn();
vi.mock('../ingest/run-extraction', () => ({ runExtraction }));
const { createIngestHandler } = await import('./ingest');

const SHARED_URL = 'https://private.example/secret-page';

function jobRow(overrides: Partial<IngestJobRow> = {}): IngestJobRow {
  return {
    id: 'job-1',
    userId: 'user-1',
    deckId: 'deck-1',
    channel: 'pwa',
    raw: { url: SHARED_URL, text: 'my secret note', images: [] },
    normalized: null,
    attempts: 1,
    ...overrides,
  } as IngestJobRow;
}

function setup(
  job: IngestJobRow | null = jobRow(),
  normalize = vi.fn().mockResolvedValue({ url: SHARED_URL, text: 'my secret note' }),
) {
  const logger = { error: vi.fn(), warn: vi.fn() };
  const jobs = {
    claim: vi.fn().mockResolvedValue(job),
    update: vi.fn(),
    setStatus: vi.fn(),
  };
  const handler = createIngestHandler({
    jobs,
    categories: { listByDeck: vi.fn().mockResolvedValue([]), findDefault: vi.fn() },
    items: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
    roleOf: vi.fn().mockResolvedValue('editor'),
    normalize,
    extraction: {} as never,
    embedQueue: { enqueueIfStale: vi.fn() } as never,
    now: () => new Date('2026-10-25T10:00:00.000Z'),
    log: vi.fn(),
    logger,
  });
  return { handler, jobs, logger };
}

function failProvider() {
  runExtraction.mockImplementation(async () => {
    throw new Error(`provider 502 while fetching ${SHARED_URL}`);
  });
}

describe('ingest handler failure logging (D195)', () => {
  beforeEach(() => {
    runExtraction.mockReset();
  });

  it('warns without the message on a retryable attempt and rethrows', async () => {
    failProvider();
    const { handler, jobs, logger } = setup(jobRow({ attempts: 1 }));

    await expect(handler('job-1')).rejects.toThrow('provider 502');

    expect(jobs.setStatus).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      { jobId: 'job-1', attempts: 1, failureCode: 'assistant_unavailable' },
      'ingest attempt failed, will retry',
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private.example');
  });

  it('fails the last attempt once at error level with the five fields and no content', async () => {
    failProvider();
    const attempts = INGEST_JOB_RETRIES + 1;
    const { handler, jobs, logger } = setup(jobRow({ attempts }));

    await expect(handler('job-1')).resolves.toBe('failed');

    expect(jobs.setStatus).toHaveBeenCalledWith(
      'job-1',
      'failed',
      expect.stringContaining('error: provider 502'),
      expect.any(Date),
      'assistant_unavailable',
    );
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      {
        jobId: 'job-1',
        deckId: 'deck-1',
        channel: 'pwa',
        attempts,
        failureCode: 'assistant_unavailable',
      },
      'ingest job failed',
    );
    const logged = JSON.stringify([logger.error.mock.calls, logger.warn.mock.calls]);
    expect(logged).not.toContain('private.example');
    expect(logged).not.toContain('my secret note');
  });

  it('classifies a fetch failure during normalize', async () => {
    const { handler, logger } = setup(
      jobRow({ attempts: INGEST_JOB_RETRIES + 1 }),
      vi.fn().mockRejectedValue(new Error('socket hang up')),
    );

    await expect(handler('job-1')).resolves.toBe('failed');
    expect(runExtraction).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'fetch_failed' }),
      'ingest job failed',
    );
  });

  it('logs the explicit code when the share copy is gone', async () => {
    const { handler, jobs, logger } = setup(jobRow({ raw: null }));

    await expect(handler('job-1')).resolves.toBe('failed');

    expect(jobs.setStatus).toHaveBeenCalledWith(
      'job-1',
      'failed',
      'raw_missing',
      expect.any(Date),
      'content_expired',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'content_expired' }),
      'ingest job failed',
    );
  });

  it('logs which fields an unreadable answer got wrong, without content', async () => {
    runExtraction.mockResolvedValue({
      ok: false,
      error: 'invalid_output: link: Invalid input: expected object, received null',
    });
    const { handler, logger } = setup();

    await expect(handler('job-1')).resolves.toBe('failed');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        failureCode: 'unreadable_answer',
        detail: 'link: Invalid input: expected object, received null',
      }),
      'ingest job failed',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private.example');
  });
});
