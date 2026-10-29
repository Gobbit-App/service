import type { Context } from 'hono';
import type { AppEnv } from '../types';
import type { LogHash } from '../lib/log-hash';
import { clientIp } from '../lib/client-ip';
import { decisionLogger, type DecisionLogger } from '../lib/decision-event';

/** D240: one event name for every per-IP refusal; later buckets (029–032) reuse it. */
export type RateLimitDecisions = {
  'rate_limit.refused': { outcome: 'refused'; reason: 'per_ip' };
};

export type RecordRefusal = (c: Context<AppEnv>, retryAfterSeconds: number) => void;

/**
 * Builds the `onLimited` side of a `publicRateLimit` bucket: records `rate_limit.refused` with
 * the bucket, path and keyed IP hash. The caller still decides the answer (problem or HTML page).
 */
export function rateLimitRefusal(opts: {
  bucket: string;
  logHash: LogHash;
  ipHeader?: string;
  decisions?: DecisionLogger<RateLimitDecisions>;
}): RecordRefusal {
  const decisions =
    opts.decisions ??
    decisionLogger<RateLimitDecisions>('rate-limit', { levels: { 'rate_limit.refused': 'warn' } });
  return (c, retryAfterSeconds) => {
    decisions.record('rate_limit.refused', {
      outcome: 'refused',
      reason: 'per_ip',
      bucket: opts.bucket,
      path: c.req.path,
      ipHash: opts.logHash('ip', clientIp(c, opts.ipHeader)),
      retryAfterSec: retryAfterSeconds,
      requestId: c.get('requestId'),
    });
  };
}
