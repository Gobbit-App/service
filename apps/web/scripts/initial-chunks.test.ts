import { describe, it, expect } from 'vitest';
import { initialChunkFiles, checkBudget, type ViteManifest } from './initial-chunks';

describe('initialChunkFiles', () => {
  it('follows static import chain and excludes dynamic imports', () => {
    const manifest: ViteManifest = {
      'src/main.ts': {
        file: 'main.js',
        isEntry: true,
        imports: ['src/static.ts'],
        dynamicImports: ['src/dynamic.ts'],
      },
      'src/static.ts': {
        file: 'static.js',
      },
      'src/dynamic.ts': {
        file: 'dynamic.js',
      },
    };

    const files = initialChunkFiles(manifest);
    expect(files).toEqual(['main.js', 'static.js']);
  });

  it('handles cycles and terminates', () => {
    const manifest: ViteManifest = {
      'src/a.ts': {
        file: 'a.js',
        isEntry: true,
        imports: ['src/b.ts'],
      },
      'src/b.ts': {
        file: 'b.js',
        imports: ['src/c.ts'],
      },
      'src/c.ts': {
        file: 'c.js',
        imports: ['src/b.ts'],
      },
    };

    const files = initialChunkFiles(manifest);
    expect(files).toEqual(['a.js', 'b.js', 'c.js']);
  });

  it('counts shared imports once', () => {
    const manifest: ViteManifest = {
      'src/main.ts': {
        file: 'main.js',
        isEntry: true,
        imports: ['src/a.ts', 'src/b.ts'],
      },
      'src/a.ts': {
        file: 'a.js',
        imports: ['src/shared.ts'],
      },
      'src/b.ts': {
        file: 'b.js',
        imports: ['src/shared.ts'],
      },
      'src/shared.ts': {
        file: 'shared.js',
      },
    };

    const files = initialChunkFiles(manifest);
    expect(files).toEqual(['a.js', 'b.js', 'main.js', 'shared.js']);
  });

  it('ignores missing import keys', () => {
    const manifest: ViteManifest = {
      'src/main.ts': {
        file: 'main.js',
        isEntry: true,
        imports: ['src/missing.ts', 'src/present.ts'],
      },
      'src/present.ts': {
        file: 'present.js',
      },
    };

    const files = initialChunkFiles(manifest);
    expect(files).toEqual(['main.js', 'present.js']);
  });
});

describe('checkBudget', () => {
  it('returns ok when total is within limit', () => {
    const entries = [
      { file: 'main.js', gzipBytes: 50 },
      { file: 'utils.js', gzipBytes: 40 },
    ];

    const result = checkBudget(entries, 100);
    expect(result).toEqual({ totalBytes: 90, ok: true });
  });

  it('returns not ok when total exceeds limit', () => {
    const entries = [
      { file: 'main.js', gzipBytes: 60 },
      { file: 'utils.js', gzipBytes: 50 },
    ];

    const result = checkBudget(entries, 100);
    expect(result).toEqual({ totalBytes: 110, ok: false });
  });
});
