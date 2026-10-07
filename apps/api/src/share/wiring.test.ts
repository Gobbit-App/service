import { describe, expect, it, vi } from 'vitest';
import type { OgRenderer } from './render';
import { lazyRenderer } from './wiring';

const renderer: OgRenderer = async () => new Uint8Array();

describe('lazyRenderer', () => {
  it('does not load until first use and then loads once', async () => {
    const load = vi.fn(async () => renderer);
    const get = lazyRenderer(load);

    expect(load).not.toHaveBeenCalled();
    await Promise.all([get(), get()]);
    expect(await get()).toBe(renderer);
    expect(load).toHaveBeenCalledOnce();
  });

  it('retries after a failed load', async () => {
    const load = vi
      .fn<() => Promise<OgRenderer>>()
      .mockRejectedValueOnce(new Error('fonts missing'))
      .mockResolvedValueOnce(renderer);
    const get = lazyRenderer(load);

    await expect(get()).rejects.toThrow('fonts missing');
    expect(await get()).toBe(renderer);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
