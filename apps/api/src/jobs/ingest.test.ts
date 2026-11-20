import type { IngestJobRow } from '@gobbit/db';
import { CARD_BODY_MAX, INGEST_JOB_RETRIES } from '@gobbit/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runExtraction = vi.fn();
vi.mock('../ingest/run-extraction', () => ({ runExtraction }));
const logExtractionSkipped = vi.fn();
vi.mock('../ingest/best-effort.events', () => ({ logExtractionSkipped }));
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
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
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
    smartShare: async () => true,
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

describe('ingest handler, smart share switched on (D453)', () => {
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

  describe('ingest handler preview fallback (D355)', () => {
    const previewSource = {
      url: SHARED_URL,
      text: 'my secret note',
      images: [],
      imageCandidates: [],
      linkPreview: { title: 'Secret page', description: 'About it' },
      fetch: { status: 200, finalUrl: SHARED_URL, ms: 1, fallback: 'none' },
    };

    function setupWithPreview(job = jobRow()) {
      const ctx = setup(job, vi.fn().mockResolvedValue(previewSource));
      const created = { id: 'item-1', title: 'Secret page', sourceUrl: SHARED_URL };
      const items = {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(created),
      };
      const autoPublish = vi.fn();
      const handler = createIngestHandler({
        jobs: ctx.jobs,
        categories: {
          listByDeck: vi.fn().mockResolvedValue([]),
          findDefault: vi.fn().mockResolvedValue({ id: 'c-default' }),
        },
        items,
        roleOf: vi.fn().mockResolvedValue('editor'),
        normalize: vi.fn().mockResolvedValue(previewSource),
        extraction: { model: 'primary' } as never,
        embedQueue: { enqueueIfStale: vi.fn() } as never,
        autoPublish,
        smartShare: async () => true,
        now: () => new Date('2026-10-25T10:00:00.000Z'),
        log: vi.fn(),
        logger: ctx.logger,
      });
      return { ...ctx, handler, items, autoPublish };
    }

    beforeEach(() => {
      runExtraction.mockReset();
    });

    it('proposes the preview card for review when the answer was unusable', async () => {
      runExtraction.mockResolvedValue({
        ok: false,
        error: 'invalid_output: propose_card call cut off by the output budget (stop: length)',
      });
      const { handler, jobs, items, autoPublish, logger } = setupWithPreview();

      await expect(handler('job-1')).resolves.toBe('proposed');

      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'link', status: 'proposed', title: 'Secret page' }),
        ['c-default'],
        expect.anything(),
      );
      expect(jobs.update).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({
          status: 'proposed',
          extraction: expect.objectContaining({ model: 'primary', fallback: 'preview' }),
        }),
      );
      expect(jobs.setStatus).not.toHaveBeenCalled();
      expect(autoPublish).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        {
          event: 'ingest.preview_fallback',
          outcome: 'proposed',
          reason: 'unreadable_answer',
          jobId: 'job-1',
          deckId: 'deck-1',
          itemId: 'item-1',
          detail: 'propose_card call cut off by the output budget (stop: length)',
        },
        expect.any(String),
      );
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private.example');
    });

    it('proposes the preview card when the provider fails on the last attempt', async () => {
      failProvider();
      const { handler, jobs, logger } = setupWithPreview(
        jobRow({ attempts: INGEST_JOB_RETRIES + 1 }),
      );

      await expect(handler('job-1')).resolves.toBe('proposed');

      expect(jobs.setStatus).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ingest.preview_fallback',
          reason: 'assistant_unavailable',
        }),
        expect.any(String),
      );
    });

    it('still retries a provider failure before the last attempt', async () => {
      failProvider();
      const { handler, items } = setupWithPreview(jobRow({ attempts: 1 }));

      await expect(handler('job-1')).rejects.toThrow('provider 502');
      expect(items.create).not.toHaveBeenCalled();
    });

    it('fails the job as before when the fallback itself fails', async () => {
      failProvider();
      const { handler, jobs, items } = setupWithPreview(
        jobRow({ attempts: INGEST_JOB_RETRIES + 1 }),
      );
      items.create.mockRejectedValue(new Error('db down'));

      await expect(handler('job-1')).resolves.toBe('failed');
      expect(jobs.setStatus).toHaveBeenCalledWith(
        'job-1',
        'failed',
        expect.stringContaining('error: provider 502'),
        expect.any(Date),
        'assistant_unavailable',
      );
    });
  });

  describe('ingest handler events (D370, D374, D375, D378)', () => {
    const eventSource = {
      url: SHARED_URL,
      text: 'Winter fair',
      images: [],
      structuredEvent: {
        name: 'Winter fair',
        startDate: '2026-12-03T18:00:00Z',
        endDate: null,
        location: 'Town hall',
        url: null,
      },
      structuredEventCount: 1,
      fetch: { status: 200, finalUrl: SHARED_URL, ms: 1, fallback: 'none' },
    };
    const eventItem = {
      type: 'event',
      status: 'proposed',
      title: 'Winter fair',
      body: '',
      categoryIds: ['c1'],
      payload: { allDay: false, start: '2026-12-03T18:00:00.000Z', timeZone: 'Europe/Paris' },
    };

    function setupEvents(raw: Record<string, unknown>) {
      const ctx = setup(jobRow({ raw: { url: SHARED_URL, images: [], ...raw } as never }));
      const items = {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'item-1', ...eventItem, sourceUrl: SHARED_URL }),
      };
      const autoPublish = vi.fn();
      const isPersonalDeck = vi.fn().mockResolvedValue(true);
      const handler = createIngestHandler({
        jobs: ctx.jobs,
        categories: {
          listByDeck: vi.fn().mockResolvedValue([{ id: 'c1', name: 'General' }]),
          findDefault: vi.fn().mockResolvedValue({ id: 'c1' }),
        },
        items,
        roleOf: vi.fn().mockResolvedValue('owner'),
        normalize: vi.fn().mockResolvedValue(eventSource),
        extraction: { model: 'primary' } as never,
        embedQueue: { enqueueIfStale: vi.fn() } as never,
        autoPublish,
        events: { defaultTimeZone: 'UTC', startMaxDays: 730, locationMax: 200, isPersonalDeck },
        smartShare: async () => true,
        now: () => new Date('2026-10-25T10:00:00.000Z'),
        log: vi.fn(),
        logger: ctx.logger,
      });
      return { ...ctx, handler, autoPublish, isPersonalDeck };
    }

    beforeEach(() => {
      runExtraction.mockReset();
    });

    it("gives extraction the page's event and the share's zone, then logs and auto-publishes", async () => {
      const event = { dateSource: 'structured', zoneSource: 'request' } as const;
      runExtraction.mockResolvedValue({
        ok: true,
        item: eventItem,
        summary: { model: 'primary', type: 'event', categoryIds: ['c1'], event },
        eventDecision: { outcome: 'event_proposed', ...event },
      });
      const { handler, autoPublish, logger, isPersonalDeck } = setupEvents({
        timeZone: 'Europe/Paris',
      });

      await expect(handler('job-1')).resolves.toBe('proposed');

      expect(isPersonalDeck).toHaveBeenCalledWith('deck-1');
      expect(runExtraction.mock.calls[0]?.[1].validate.event).toEqual({
        structured: eventSource.structuredEvent,
        severalEvents: false,
        timeZone: 'Europe/Paris',
        zoneSource: 'request',
        personalDeck: true,
        startMaxDays: 730,
        locationMax: 200,
        now: new Date('2026-10-25T10:00:00.000Z'),
      });
      expect(logger.info).toHaveBeenCalledWith(
        {
          event: 'ingest.event_extract',
          outcome: 'event_proposed',
          dateSource: 'structured',
          zoneSource: 'request',
          jobId: 'job-1',
          deckId: 'deck-1',
          userId: 'user-1',
          itemId: 'item-1',
        },
        expect.any(String),
      );
      expect(autoPublish).toHaveBeenCalledWith(expect.objectContaining({ event }));
    });

    it('falls back to the default zone without a request zone', async () => {
      runExtraction.mockResolvedValue({ ok: false, error: 'provider down' });
      const { handler } = setupEvents({});
      await handler('job-1').catch(() => undefined);
      expect(runExtraction.mock.calls[0]?.[1].validate.event).toMatchObject({
        timeZone: 'UTC',
        zoneSource: 'fallback',
      });
    });
  });
});

describe('ingest handler best effort, smart share off (D453, D454)', () => {
  const page = {
    url: SHARED_URL,
    text: 'my secret note',
    images: [],
    imageCandidates: [],
    linkPreview: { title: 'Secret page', description: 'About it' },
    fetch: { status: 200, finalUrl: SHARED_URL, ms: 1, fallback: 'none' },
  };
  const photo = { publicId: 'p1', bytes: 10, mime: 'image/jpeg' };
  const direct = {
    model: 'direct',
    escalated: false,
    confidence: 0,
    categoryIds: ['c-default'],
    newCategory: null,
    fallback: 'no_smart_share',
  };

  function setupOff(raw: Record<string, unknown>) {
    const ctx = setup(jobRow({ raw: { images: [], ...raw } as never }));
    const items = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'item-1', title: 'T', sourceUrl: null }),
    };
    const autoPublish = vi.fn();
    const normalize = vi.fn().mockResolvedValue(page);
    const handler = createIngestHandler({
      jobs: ctx.jobs,
      categories: {
        listByDeck: vi.fn().mockResolvedValue([{ id: 'c1', name: 'General' }]),
        findDefault: vi.fn().mockResolvedValue({ id: 'c-default' }),
      },
      items,
      roleOf: vi.fn().mockResolvedValue('owner'),
      normalize,
      extraction: { model: 'primary' } as never,
      embedQueue: { enqueueIfStale: vi.fn() } as never,
      autoPublish,
      smartShare: async () => false,
      now: () => new Date('2026-10-25T10:00:00.000Z'),
      log: vi.fn(),
      logger: ctx.logger,
    });
    return { ...ctx, handler, items, autoPublish, normalize };
  }

  beforeEach(() => {
    runExtraction.mockReset();
    logExtractionSkipped.mockReset();
  });

  it('proposes a link card from the page without the model, publishing or categories', async () => {
    const { handler, jobs, items, autoPublish, normalize } = setupOff({
      url: SHARED_URL,
      images: [photo, { ...photo, publicId: 'p2' }],
    });

    await expect(handler('job-1')).resolves.toBe('proposed');

    expect(runExtraction).not.toHaveBeenCalled();
    expect(autoPublish).not.toHaveBeenCalled();
    expect(normalize).toHaveBeenCalledOnce();
    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'link', status: 'proposed' }),
      ['c-default'],
      expect.anything(),
    );
    expect(jobs.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'proposed', extraction: expect.objectContaining(direct) }),
    );
    expect(jobs.setStatus).not.toHaveBeenCalled();
    expect(logExtractionSkipped).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outcome: 'proposed',
        jobId: 'job-1',
        deckId: 'deck-1',
        userId: 'user-1',
        channel: 'pwa',
        kind: 'link',
        itemId: 'item-1',
        cut: false,
        unusedPhotos: 2,
      }),
    );
  });

  it('proposes a text card without fetching anything', async () => {
    const { handler, jobs, normalize } = setupOff({ text: 'Remember the milk\nand eggs' });

    await expect(handler('job-1')).resolves.toBe('proposed');

    expect(normalize).not.toHaveBeenCalled();
    expect(runExtraction).not.toHaveBeenCalled();
    const extraction = jobs.update.mock.calls.at(-1)?.[1].extraction;
    expect(extraction).toEqual(expect.objectContaining(direct));
    expect(extraction).not.toHaveProperty('bodyCut');
    expect(logExtractionSkipped).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'text', cut: false, unusedPhotos: 0 }),
    );
  });

  it('proposes a media card from photos without fetching, and marks a cut body', async () => {
    const { handler, jobs, items, normalize } = setupOff({
      title: 'Holiday',
      text: 'x'.repeat(CARD_BODY_MAX + 50),
      images: [photo],
    });

    await expect(handler('job-1')).resolves.toBe('proposed');

    expect(normalize).not.toHaveBeenCalled();
    expect(items.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'media', status: 'proposed' }),
      expect.anything(),
      expect.anything(),
    );
    expect(jobs.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        extraction: expect.objectContaining({ ...direct, bodyCut: true }),
      }),
    );
    expect(logExtractionSkipped).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'media', cut: true }),
    );
  });

  it('fails a share that builds nothing with best_effort_empty and logs it', async () => {
    const { handler, jobs, items } = setupOff({});

    await expect(handler('job-1')).resolves.toBe('failed');

    expect(runExtraction).not.toHaveBeenCalled();
    expect(items.create).not.toHaveBeenCalled();
    expect(jobs.setStatus).toHaveBeenCalledWith(
      'job-1',
      'failed',
      'best_effort_empty',
      expect.any(Date),
      'unknown',
    );
    expect(logExtractionSkipped).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outcome: 'failed', kind: null, cut: false, unusedPhotos: 0 }),
    );
    expect(logExtractionSkipped.mock.calls[0]?.[1]).not.toHaveProperty('itemId');
  });

  it('leaves a file share as it is and logs nothing', async () => {
    const { handler, normalize } = setupOff({
      file: { publicId: 'f1', kind: 'pdf', bytes: 10, mime: 'application/pdf' },
    });

    await expect(handler('job-1')).resolves.toBe('proposed');

    expect(normalize).not.toHaveBeenCalled();
    expect(runExtraction).not.toHaveBeenCalled();
    expect(logExtractionSkipped).not.toHaveBeenCalled();
  });
});

describe('ingest handler reads smart share at run time (D453)', () => {
  function build(claim: unknown) {
    let on = false;
    const jobs = { claim: vi.fn().mockResolvedValue(claim), update: vi.fn(), setStatus: vi.fn() };
    const items = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'item-1', title: 'T', sourceUrl: null }),
    };
    const normalize = vi.fn().mockResolvedValue({ url: SHARED_URL, text: 'my secret note' });
    const smartShare = vi.fn(async () => on);
    const handler = createIngestHandler({
      jobs,
      categories: {
        listByDeck: vi.fn().mockResolvedValue([]),
        findDefault: vi.fn().mockResolvedValue({ id: 'c-default' }),
      },
      items,
      roleOf: vi.fn().mockResolvedValue('editor'),
      normalize,
      extraction: { model: 'primary' } as never,
      embedQueue: { enqueueIfStale: vi.fn() } as never,
      smartShare,
      now: () => new Date('2026-10-25T10:00:00.000Z'),
      log: vi.fn(),
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    });
    return { handler, jobs, items, smartShare, turnOn: () => (on = true) };
  }

  beforeEach(() => {
    runExtraction.mockReset();
    logExtractionSkipped.mockReset();
  });

  it('uses the setting at run time: off at enqueue, on at run reaches the extractor', async () => {
    runExtraction.mockResolvedValue({ ok: false, error: 'provider down' });
    const { handler, smartShare, turnOn } = build(
      jobRow({ raw: { text: 'a note', images: [] } as never }),
    );
    turnOn();

    await handler('job-1');

    expect(smartShare).toHaveBeenCalledWith('user-1');
    expect(runExtraction).toHaveBeenCalledOnce();
    expect(logExtractionSkipped).not.toHaveBeenCalled();
  });

  it('uses the setting at run time: still off at run saves the share as sent', async () => {
    const { handler } = build(jobRow({ raw: { text: 'a note', images: [] } as never }));

    await expect(handler('job-1')).resolves.toBe('proposed');

    expect(runExtraction).not.toHaveBeenCalled();
  });

  it('skips an already-processed job: nothing is read or redone', async () => {
    const { handler, smartShare, items } = build(null);

    await expect(handler('job-1')).resolves.toBe('skipped');

    expect(smartShare).not.toHaveBeenCalled();
    expect(runExtraction).not.toHaveBeenCalled();
    expect(items.create).not.toHaveBeenCalled();
  });
});
