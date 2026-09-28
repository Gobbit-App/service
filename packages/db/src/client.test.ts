import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPool } from './client';

describe('createPool', () => {
  afterEach(() => vi.restoreAllMocks());

  it('handles idle client errors instead of crashing', () => {
    const pool = createPool('postgres://u:p@localhost:1/none');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => pool.emit('error', new Error('boom'))).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('stays silent on admin_shutdown (57P01)', () => {
    const pool = createPool('postgres://u:p@localhost:1/none');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = Object.assign(new Error('terminating connection'), { code: '57P01' });
    expect(() => pool.emit('error', err)).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
