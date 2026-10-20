import { ITEM_UNDELETE_DAYS } from '@pb/shared';
import { describe, expect, it, vi } from 'vitest';
import { createPruneDeletedItems } from './prune-deleted-items';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-18T05:00:00.000Z');

function repo(purged = 0) {
  return { purgeDeletedBefore: vi.fn(async (_cutoff: Date) => purged) };
}

describe('createPruneDeletedItems (D132)', () => {
  it('purges rows deleted before now minus the undo window (30 days)', async () => {
    const items = repo();
    await createPruneDeletedItems({ items, now: () => NOW, log: vi.fn() })();

    const cutoff = items.purgeDeletedBefore.mock.calls[0]?.[0] as Date;
    expect(ITEM_UNDELETE_DAYS).toBe(30);
    expect(cutoff.getTime()).toBe(NOW.getTime() - 30 * DAY_MS);
  });

  it('returns and logs the purged count', async () => {
    const log = vi.fn();
    const purged = await createPruneDeletedItems({ items: repo(3), now: () => NOW, log })();

    expect(purged).toBe(3);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('purged 3 deleted items'));
  });

  it('honours a custom window', async () => {
    const items = repo();
    await createPruneDeletedItems({ items, now: () => NOW, undeleteDays: 7, log: vi.fn() })();

    const cutoff = items.purgeDeletedBefore.mock.calls[0]?.[0] as Date;
    expect(cutoff.getTime()).toBe(NOW.getTime() - 7 * DAY_MS);
  });
});
