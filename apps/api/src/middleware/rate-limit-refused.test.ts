import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from '../lib/decision-event';
import { createLogHash } from '../lib/log-hash';
import type { AppEnv } from '../types';
import { rateLimitRefusal, type RateLimitDecisions } from './rate-limit-refused';

const logHash = createLogHash('k'.repeat(32));

describe('rateLimitRefusal (D240)', () => {
  it('records rate_limit.refused with bucket, path, keyed IP hash and retry', async () => {
    const { logger, lines, flush } = captureLogger();
    const refuse = rateLimitRefusal({
      bucket: 'waitlist',
      logHash,
      ipHeader: 'x-test-ip',
      decisions: decisionLogger<RateLimitDecisions>('rate-limit', {
        parent: logger,
        levels: { 'rate_limit.refused': 'warn' },
      }),
    });
    const app = new Hono<AppEnv>();
    app.post('/waitlist', (c) => {
      c.set('requestId', 'req-9');
      refuse(c, 120);
      return c.body(null, 429);
    });

    await app.request('/waitlist', { method: 'POST', headers: { 'x-test-ip': '10.0.0.1' } });
    await flush();

    const line = expectDecision(lines, 'rate_limit.refused', {
      outcome: 'refused',
      reason: 'per_ip',
    });
    expect(line).toMatchObject({
      bucket: 'waitlist',
      path: '/waitlist',
      ipHash: logHash('ip', '10.0.0.1'),
      retryAfterSec: 120,
      requestId: 'req-9',
      level: 'warn',
    });
    expect(JSON.stringify(lines)).not.toContain('10.0.0.1');
  });
});
