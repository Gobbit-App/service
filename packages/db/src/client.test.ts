import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPool } from './client';

const URL = 'postgres://u:p@localhost:1/none';

describe('createPool', () => {
  afterEach(() => vi.restoreAllMocks());

  it('handles idle client errors instead of crashing, as one JSON line by default', () => {
    const pool = createPool(URL);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
    expect(() => pool.emit('error', err)).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toMatchObject({
      level: 'error',
      component: 'db',
      err: { message: 'boom', code: 'ECONNRESET' },
    });
  });

  it('routes idle client errors to onIdleError when given', () => {
    const onIdleError = vi.fn();
    const pool = createPool(URL, { onIdleError });
    const err = new Error('boom');
    pool.emit('error', err);
    expect(onIdleError).toHaveBeenCalledWith(err);
  });

  it('stays silent on admin_shutdown (57P01)', () => {
    const onIdleError = vi.fn();
    const pool = createPool(URL, { onIdleError });
    const err = Object.assign(new Error('terminating connection'), { code: '57P01' });
    expect(() => pool.emit('error', err)).not.toThrow();
    expect(onIdleError).not.toHaveBeenCalled();
  });
});
