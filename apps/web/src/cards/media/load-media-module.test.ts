import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadMediaModule,
  loadedMediaModule,
  prefetchMediaModule,
  resetMediaModules,
} from './load-media-module';
import { activeMediaId, releaseActiveMedia, setActiveMedia } from './use-active-media';

const fakeViewer = { PageViewer: () => null } as never;

afterEach(() => {
  resetMediaModules();
  releaseActiveMedia();
  vi.unstubAllGlobals();
});

describe('loadMediaModule (D400)', () => {
  it('imports once and keeps the module', async () => {
    const importer = vi.fn(async () => fakeViewer);
    resetMediaModules({ viewer: importer });
    await Promise.all([loadMediaModule('viewer'), loadMediaModule('viewer')]);
    await loadMediaModule('viewer');
    expect(importer).toHaveBeenCalledTimes(1);
    expect(loadedMediaModule('viewer')).toBe(fakeViewer);
  });

  it('forgets a failed load so a retry imports again', async () => {
    const importer = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(fakeViewer);
    resetMediaModules({ viewer: importer });
    await expect(loadMediaModule('viewer')).rejects.toThrow('offline');
    expect(loadedMediaModule('viewer')).toBeNull();
    await expect(loadMediaModule('viewer')).resolves.toBe(fakeViewer);
  });

  it('skips idle prefetch when the connection saves data, never on intent', () => {
    const importer = vi.fn(async () => fakeViewer);
    resetMediaModules({ viewer: importer });
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    prefetchMediaModule('viewer', { idle: true });
    expect(importer).not.toHaveBeenCalled();
    prefetchMediaModule('viewer');
    expect(importer).toHaveBeenCalledTimes(1);
  });
});

describe('active media (D400, FR-016)', () => {
  it('keeps one player at a time and releases it', () => {
    setActiveMedia('a');
    setActiveMedia('b');
    expect(activeMediaId()).toBe('b');
    releaseActiveMedia();
    expect(activeMediaId()).toBeNull();
  });
});
