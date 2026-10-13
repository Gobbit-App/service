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

    expect(boss.getQueue).toHaveBeenCalledTimes(3);
    expect(boss.createQueue).toHaveBeenCalledTimes(3);
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.embedItem, { policy: 'stately' });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.embedSweep, { policy: 'singleton' });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.pruneSearchQueries, {
      policy: 'singleton',
    });
  });

  it('uses the expected queue names', async () => {
    const boss = makeBoss();

    await ensureQueues(boss as never);

    expect(boss.getQueue).toHaveBeenCalledWith('embed-item');
    expect(boss.getQueue).toHaveBeenCalledWith('embed-sweep');
    expect(boss.getQueue).toHaveBeenCalledWith('prune-search-queries');
  });

  it('skips queues that already exist', async () => {
    const boss = makeBoss({
      [QUEUES.embedItem]: { name: QUEUES.embedItem },
      [QUEUES.embedSweep]: { name: QUEUES.embedSweep },
      [QUEUES.pruneSearchQueries]: { name: QUEUES.pruneSearchQueries },
    });

    await ensureQueues(boss as never);

    expect(boss.getQueue).toHaveBeenCalledTimes(3);
    expect(boss.createQueue).not.toHaveBeenCalled();
  });

  it('creates only the missing queues when some already exist', async () => {
    const boss = makeBoss({
      [QUEUES.embedItem]: { name: QUEUES.embedItem },
    });

    await ensureQueues(boss as never);

    expect(boss.createQueue).toHaveBeenCalledTimes(2);
    expect(boss.createQueue).not.toHaveBeenCalledWith(QUEUES.embedItem, expect.anything());
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.embedSweep, { policy: 'singleton' });
    expect(boss.createQueue).toHaveBeenCalledWith(QUEUES.pruneSearchQueries, {
      policy: 'singleton',
    });
  });
});
