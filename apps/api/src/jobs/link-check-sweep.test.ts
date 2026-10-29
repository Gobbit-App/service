import { describe, expect, it, vi } from 'vitest';
import { LINK_CHECK_CRON } from '@gobbit/shared';
import { scheduleLinkCheckSweep } from './link-check-sweep';

describe('scheduleLinkCheckSweep (D164)', () => {
  it('registers the daily schedule and runs one sweep per job', async () => {
    let handler: (() => Promise<void>) | undefined;
    const boss = {
      schedule: vi.fn(async () => undefined),
      work: vi.fn(async (_name: string, fn: () => Promise<void>) => {
        handler = fn;
        return 'worker';
      }),
    };
    const checker = { sweep: vi.fn().mockResolvedValue({ checked: 0 }) };

    await scheduleLinkCheckSweep(boss, checker);

    expect(boss.schedule).toHaveBeenCalledWith('link-check-sweep', LINK_CHECK_CRON);
    expect(boss.work).toHaveBeenCalledWith('link-check-sweep', expect.any(Function));
    await handler?.();
    expect(checker.sweep).toHaveBeenCalledTimes(1);
  });
});
