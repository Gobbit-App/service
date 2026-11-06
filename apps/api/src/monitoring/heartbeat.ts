import type { Logger } from '../lib/logger';
import { createDeadManPing, noopDeadManPing, type DeadManPing } from './dead-man-ping';

/**
 * D342: one heartbeat tick. Runs `check` (a DB ping, plus the worker's healthcheck file), then
 * reports the outcome to the dead man's switch. Never throws: a failed check is logged and sent
 * as a `/fail` ping so the alarm doesn't wait for the grace period.
 */
export async function reportHeartbeat(
  check: () => Promise<void>,
  ping: DeadManPing,
  log: Logger,
): Promise<boolean> {
  try {
    await check();
  } catch (err) {
    log.error({ err }, 'heartbeat failed');
    await ping.fail('heartbeat failed');
    return false;
  }
  await ping.ok();
  return true;
}

/** The ping for one service, or a no-op when its URL is unset; logs which, once at start. */
export function deadManPingFor(url: string | undefined, log: Logger): DeadManPing {
  log.info(
    { event: 'monitor.config', outcome: url ? 'enabled' : 'disabled' },
    url ? 'dead man switch on' : 'dead man switch off (no ping URL)',
  );
  return url ? createDeadManPing({ url, log }) : noopDeadManPing;
}
