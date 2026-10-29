import { describe, it, expect } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from './decision-event';

type Catalog = {
  'demo.join': { outcome: 'created' | 'refused'; reason: 'per_email' };
  'demo.mail': { outcome: 'sent' | 'failed' };
};

function setup() {
  const capture = captureLogger();
  const decisions = decisionLogger<Catalog>('demo', {
    parent: capture.logger,
    levels: { 'demo.join:refused': 'warn', 'demo.mail:failed': 'error' },
  });
  return { ...capture, decisions };
}

describe('decisionLogger (D239)', () => {
  it('writes event, outcome, reason, correlation id and subjects', async () => {
    const { decisions, lines, flush } = setup();
    decisions.record('demo.join', {
      outcome: 'refused',
      reason: 'per_email',
      requestId: 'req-1',
      emailHash: 'abc123',
    });
    await flush();
    const line = expectDecision(lines, 'demo.join', { outcome: 'refused', reason: 'per_email' });
    expect(line).toMatchObject({
      component: 'demo',
      msg: 'demo.join',
      requestId: 'req-1',
      emailHash: 'abc123',
      level: 'warn',
    });
  });

  it('defaults to info and uses the per-outcome level map', async () => {
    const { decisions, lines, flush } = setup();
    decisions.record('demo.join', { outcome: 'created', requestId: 'r' });
    decisions.record('demo.mail', { outcome: 'failed', jobId: 'job-1' });
    await flush();
    expect(expectDecision(lines, 'demo.join', { outcome: 'created' }).level).toBe('info');
    expect(expectDecision(lines, 'demo.mail', { outcome: 'failed' })).toMatchObject({
      level: 'error',
      jobId: 'job-1',
    });
  });

  it.each(['email', 'ip', 'to'])('refuses a raw %s field', (key) => {
    const { decisions } = setup();
    const fields = { outcome: 'created', requestId: 'r', [key]: 'parent@example.test' } as never;
    expect(() => decisions.record('demo.join', fields)).toThrow(/keyed hash/);
  });

  it('requires a requestId or jobId', () => {
    const { decisions } = setup();
    expect(() => decisions.record('demo.join', { outcome: 'created' } as never)).toThrow(
      /requestId, jobId or bootId/,
    );
  });

  it('expectDecision lists what it saw when nothing matches', async () => {
    const { decisions, lines, flush } = setup();
    decisions.record('demo.join', { outcome: 'created', requestId: 'r' });
    await flush();
    expect(() => expectDecision(lines, 'demo.join', { outcome: 'refused' })).toThrow(
      /saw \[demo.join:created:\]/,
    );
  });
});
