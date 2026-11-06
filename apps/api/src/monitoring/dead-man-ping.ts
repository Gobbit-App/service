import type { Logger } from '../lib/logger';

/**
 * D342, ADR-074: a dead man's switch (Healthchecks.io-style ping URL). The worker reports each
 * heartbeat; the monitor alarms when pings stop (process, container, host or network dead) or
 * when a `/fail` ping arrives (alive but its database check failed).
 *
 * The URL is operator configuration, not user input, so it is fetched directly rather than
 * through safe-fetch (ADR-048 guards shared URLs). Pings never throw and never block for long.
 */
export interface DeadManPing {
  /** The heartbeat succeeded; pinged at most once per `minIntervalMs`. */
  ok(): Promise<void>;
  /** The heartbeat failed; always pinged so the alarm is immediate. */
  fail(reason: string): Promise<void>;
}

export interface DeadManPingOptions {
  url: string;
  log: Logger;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  timeoutMs?: number;
  minIntervalMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MIN_INTERVAL_MS = 60_000;
/** Healthchecks.io caps the request body it keeps; a reason is a short label anyway. */
const MAX_REASON_CHARS = 200;

export const noopDeadManPing: DeadManPing = {
  ok: async () => {},
  fail: async () => {},
};

export function createDeadManPing({
  url,
  log,
  fetch = globalThis.fetch,
  now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
}: DeadManPingOptions): DeadManPing {
  const base = url.replace(/\/+$/, '');
  let lastOkAt: number | null = null;
  // Log only when reachability changes, so an unreachable monitor doesn't flood the logs.
  let reachable = true;

  const send = async (target: string, body?: string): Promise<boolean> => {
    try {
      const res = await fetch(target, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!reachable) {
        log.info({ event: 'monitor.ping', outcome: 'recovered' }, 'monitor ping recovered');
      }
      reachable = true;
      return true;
    } catch (err) {
      if (reachable) {
        log.warn({ event: 'monitor.ping', outcome: 'failed', err }, 'monitor ping failed');
      }
      reachable = false;
      return false;
    }
  };

  return {
    async ok() {
      const at = now();
      if (lastOkAt !== null && at - lastOkAt < minIntervalMs) return;
      if (await send(base)) lastOkAt = at;
    },
    async fail(reason) {
      lastOkAt = null;
      await send(`${base}/fail`, reason.slice(0, MAX_REASON_CHARS));
    },
  };
}
