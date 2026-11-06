import { describe, it, expect, vi } from 'vitest';
import { deadManPingFor, reportHeartbeat } from './heartbeat';
import { noopDeadManPing, type DeadManPing } from './dead-man-ping';
import type { Logger } from '../lib/logger';

const makeLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as Logger;
const makePing = () =>
  ({ ok: vi.fn(async () => {}), fail: vi.fn(async () => {}) }) satisfies DeadManPing;

describe('reportHeartbeat', () => {
  it('pings ok after a passing check', async () => {
    const ping = makePing();
    await expect(reportHeartbeat(async () => {}, ping, makeLog())).resolves.toBe(true);
    expect(ping.ok).toHaveBeenCalledTimes(1);
    expect(ping.fail).not.toHaveBeenCalled();
  });

  it('logs and pings fail when the check throws, without throwing', async () => {
    const ping = makePing();
    const log = makeLog();
    const check = async () => {
      throw new Error('db down');
    };
    await expect(reportHeartbeat(check, ping, log)).resolves.toBe(false);
    expect(ping.fail).toHaveBeenCalledWith('heartbeat failed');
    expect(ping.ok).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});

describe('deadManPingFor', () => {
  it('returns the no-op and logs disabled without a URL', () => {
    const log = makeLog();
    expect(deadManPingFor(undefined, log)).toBe(noopDeadManPing);
    expect(log.info).toHaveBeenCalledWith(
      { event: 'monitor.config', outcome: 'disabled' },
      expect.any(String),
    );
  });

  it('returns a real ping and logs enabled with a URL', () => {
    const log = makeLog();
    expect(deadManPingFor('https://hc-ping.com/x', log)).not.toBe(noopDeadManPing);
    expect(log.info).toHaveBeenCalledWith(
      { event: 'monitor.config', outcome: 'enabled' },
      expect.any(String),
    );
  });
});
