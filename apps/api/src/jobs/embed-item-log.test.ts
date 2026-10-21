import { describe, it, expect } from 'vitest';
import { withEmbedItemLog } from './embed-item-log';
import { captureLogger } from '../../test/capture-logger';

function setup(embedItem: Parameters<typeof withEmbedItemLog>[0]) {
  const { lines, logger, flush } = captureLogger();
  let t = 0;
  const logged = withEmbedItemLog(embedItem, { log: logger, now: () => (t += 10) });
  return { logged, lines, flush };
}

describe('withEmbedItemLog', () => {
  it('logs the outcome and duration and returns the outcome', async () => {
    const { logged, lines, flush } = setup(async () => 'embedded');

    await expect(logged('item-1', { id: 'job-1' })).resolves.toBe('embedded');
    await flush();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      msg: 'embed item',
      itemId: 'item-1',
      jobId: 'job-1',
      outcome: 'embedded',
      durationMs: 10,
    });
  });

  it('passes the job through to the handler', async () => {
    const seen: unknown[] = [];
    const { logged } = setup(async (itemId, job) => {
      seen.push(itemId, job?.id);
      return 'fresh';
    });

    await logged('item-2', { id: 'job-2' });

    expect(seen).toEqual(['item-2', 'job-2']);
  });

  it('logs failures and rethrows so pg-boss retries', async () => {
    const { logged, lines, flush } = setup(async () => {
      throw new Error('rate limited');
    });

    await expect(logged('item-3')).rejects.toThrow('rate limited');
    await flush();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'error',
      itemId: 'item-3',
      jobId: null,
      durationMs: 10,
      err: { message: 'rate limited' },
    });
  });
});
