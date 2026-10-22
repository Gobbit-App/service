import { describe, expect, it, vi } from 'vitest';
import { ensureQueues } from './ensure-queues';
import { QUEUES } from './queues';

function makeBoss(existing: Record<string, object> = {}) {
  return {
    getQueue: vi.fn(async (name: string) => existing[name] ?? null),
    createQueue: vi.fn(async () => undefined),
  };
}

describe('ensureQueues', () => {
  it('creates each missing queue with its policy', async () => {
    const boss = makeBoss();

    await ensureQueues(boss as never);

    expect(boss.getQueue).toHaveBeenCalledTimes(10);
    expect(boss.createQueue).toHaveBeenCalledTimes(10);
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.embedItem, { policy: 'stately' });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.embedSweep, { policy: 'singleton' });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.pruneSearchQueries, {
      policy: 'singleton',
    });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.pruneDeletedItems, {
      policy: 'singleton',
    });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.mediaSweep, { policy: 'singleton' });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.linkSnapshot, { policy: 'stately' });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.linkCheckSweep, { policy: 'singleton' });
  });

  it('uses the expected queue names', async () => {
    const boss = makeBoss();

    await ensureQueues(boss as never);

    expect(boss.getQueue).toHaveBeenCalledWith('embed-item');
    expect(boss.getQueue).toHaveBeenCalledWith('embed-sweep');
    expect(boss.getQueue).toHaveBeenCalledWith('prune-search-queries');
    expect(boss.getQueue).toHaveBeenCalledWith('ingest');
    expect(boss.getQueue).toHaveBeenCalledWith('ingest-sweep');
    expect(boss.getQueue).toHaveBeenCalledWith('prune-ingest-jobs');
    expect(boss.getQueue).toHaveBeenCalledWith('prune-deleted-items');
    expect(boss.getQueue).toHaveBeenCalledWith('media-sweep');
  });

  it('creates the ingest queue stately (one queued + one active per job)', async () => {
    const boss = makeBoss();

    await ensureQueues(boss as never);

    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.ingest, { policy: 'stately' });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.ingestSweep, { policy: 'singleton' });
  });

  it('skips queues that already exist', async () => {
    const boss = makeBoss({
      [QUEUES.embedItem]: { name: QUEUES.embedItem },
      [QUEUES.embedSweep]: { name: QUEUES.embedSweep },
      [QUEUES.pruneSearchQueries]: { name: QUEUES.pruneSearchQueries },
      [QUEUES.ingest]: { name: QUEUES.ingest },
      [QUEUES.ingestSweep]: { name: QUEUES.ingestSweep },
      [QUEUES.pruneIngestJobs]: { name: QUEUES.pruneIngestJobs },
      [QUEUES.pruneDeletedItems]: { name: QUEUES.pruneDeletedItems },
      [QUEUES.mediaSweep]: { name: QUEUES.mediaSweep },
      [QUEUES.linkSnapshot]: { name: QUEUES.linkSnapshot },
      [QUEUES.linkCheckSweep]: { name: QUEUES.linkCheckSweep },
    });

    await ensureQueues(boss as never);

    expect(boss.getQueue).toHaveBeenCalledTimes(10);
    expect(boss.createQueue).not.toHaveBeenCalled();
  });

  it('creates only the missing queues when some already exist', async () => {
    const boss = makeBoss({
      [QUEUES.embedItem]: { name: QUEUES.embedItem },
    });

    await ensureQueues(boss as never);

    expect(boss.createQueue).toHaveBeenCalledTimes(9);
    expect(boss.createQueue).not.toHaveBeenCalledWith(QUEUES.embedItem, expect.anything());
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.embedSweep, { policy: 'singleton' });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.pruneSearchQueries, {
      policy: 'singleton',
    });
  });
});
