import { describe, expect, it } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { recordRegistrationMode } from './registration-mode';

describe('recordRegistrationMode (D241)', () => {
  it.each([
    ['waitlist', 'production', 'info'],
    ['open', 'development', 'info'],
    ['open', 'production', 'warn'],
  ] as const)('records %s in %s at %s', async (mode, nodeEnv, level) => {
    const capture = captureLogger();

    recordRegistrationMode(
      { REGISTRATION_MODE: mode, NODE_ENV: nodeEnv },
      { bootId: 'boot-1' },
      capture.logger,
    );

    await capture.flush();
    const line = expectDecision(capture.lines, 'registration.mode', { outcome: 'configured' });
    expect(line).toMatchObject({ level, mode, bootId: 'boot-1' });
  });
});
