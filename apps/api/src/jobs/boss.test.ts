import { describe, expect, it } from 'vitest';
import { bossErrorHandler } from './boss';
import { captureLogger } from '../../test/capture-logger';

describe('bossErrorHandler', () => {
  it('logs the error with its code and the role on one line', async () => {
    const { lines, logger, flush } = captureLogger();
    const err = Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });

    bossErrorHandler('worker', logger)(err);
    await flush();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'error',
      role: 'worker',
      msg: 'pg-boss error',
      err: { message: 'connect ECONNREFUSED 10.0.0.1:5432', code: 'ECONNREFUSED' },
    });
  });
});
