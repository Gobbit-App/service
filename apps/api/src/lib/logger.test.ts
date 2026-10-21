import { describe, expect, it } from 'vitest';
import { captureLogger } from '../../test/capture-logger';
import { childLogger, lineSink, resolveLogLevel } from './logger';

describe('resolveLogLevel', () => {
  it('uses LOG_LEVEL when valid', () => {
    expect(resolveLogLevel({ LOG_LEVEL: 'DEBUG' })).toBe('debug');
  });

  it('ignores unknown levels', () => {
    expect(resolveLogLevel({ LOG_LEVEL: 'loud' })).toBe('info');
  });

  it('is silent under vitest unless asked', () => {
    expect(resolveLogLevel({ VITEST: 'true' })).toBe('silent');
    expect(resolveLogLevel({ VITEST: 'true', LOG_LEVEL: 'warn' })).toBe('warn');
  });
});

describe('createLogger', () => {
  it('writes one JSON object per line with iso time, level label and component', async () => {
    const { lines, logger, flush } = captureLogger();
    childLogger('api', logger).info({ status: 200 }, 'request');
    await flush();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      component: 'api',
      status: 200,
      msg: 'request',
    });
    expect(new Date(lines[0]!.time as string).toISOString()).toBe(lines[0]!.time);
  });

  it('serializes errors under err', async () => {
    const { lines, logger, flush } = captureLogger();
    logger.error({ err: Object.assign(new Error('boom'), { code: 'E1' }) }, 'failed');
    await flush();

    expect(lines[0]).toMatchObject({
      level: 'error',
      msg: 'failed',
      err: { type: 'Error', message: 'boom', code: 'E1' },
    });
    expect((lines[0]!.err as { stack: string }).stack).toContain('boom');
  });
});

describe('lineSink', () => {
  it('strips the [tag] prefix and logs at the given level', async () => {
    const { lines, logger, flush } = captureLogger();
    lineSink('search', 'warn', logger)('[search] embed failed');
    await flush();

    expect(lines[0]).toMatchObject({ level: 'warn', component: 'search', msg: 'embed failed' });
  });

  it('attaches an error when given', async () => {
    const { lines, logger, flush } = captureLogger();
    lineSink('share', 'error', logger)('upload failed', new Error('nope'));
    await flush();

    expect(lines[0]).toMatchObject({ component: 'share', err: { message: 'nope' } });
  });
});
