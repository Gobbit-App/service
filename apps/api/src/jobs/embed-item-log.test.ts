import { describe, it, expect } from 'vitest';
import { withEmbedItemLog } from './embed-item-log';

function setup(embedItem: Parameters<typeof withEmbedItemLog>[0]) {
  const lines: string[] = [];
  const errors: string[] = [];
  let t = 0;
  const logged = withEmbedItemLog(embedItem, {
    log: (line) => lines.push(line),
    logError: (line) => errors.push(line),
    now: () => (t += 10),
  });
  return { logged, lines, errors };
}

describe('withEmbedItemLog', () => {
  it('logs the outcome and duration and returns the outcome', async () => {
    const { logged, lines, errors } = setup(async () => 'embedded');

    await expect(logged('item-1', { id: 'job-1' })).resolves.toBe('embedded');

    expect(lines).toEqual(['[worker] embed item-1 → embedded (10ms)']);
    expect(errors).toEqual([]);
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
    const { logged, lines, errors } = setup(async () => {
      throw new Error('rate limited');
    });

    await expect(logged('item-3')).rejects.toThrow('rate limited');

    expect(lines).toEqual([]);
    expect(errors).toEqual([
      '[worker] embed item-3 failed after 10ms, pg-boss will retry: rate limited',
    ]);
  });
});
