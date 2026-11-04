import { describe, expect, it } from 'vitest';
import { BRAND_ASSETS, HEADER_LOGO_PATH } from './app-icons';

const byFile = (file: string) => BRAND_ASSETS.find((a) => a.file === file);

describe('BRAND_ASSETS', () => {
  it('lists every file the manifest, index.html and headers reference', () => {
    expect(BRAND_ASSETS.map((a) => a.file)).toEqual([
      'favicon.svg',
      'icons/logo.svg',
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-maskable-512.png',
      'icons/apple-touch-icon.png',
    ]);
    expect(HEADER_LOGO_PATH).toBe('/icons/logo.svg');
  });

  it('rasterises the PNGs at their declared sizes and keeps SVGs vector', () => {
    expect(byFile('icons/icon-192.png')?.png).toBe(192);
    expect(byFile('icons/icon-512.png')?.png).toBe(512);
    expect(byFile('icons/icon-maskable-512.png')?.png).toBe(512);
    expect(byFile('icons/apple-touch-icon.png')?.png).toBe(180);
    expect(byFile('favicon.svg')?.png).toBeUndefined();
  });

  it('drops the chimney only for the favicon', () => {
    expect(byFile('favicon.svg')?.options.chimney).toBe(false);
    for (const asset of BRAND_ASSETS.filter((a) => a.file !== 'favicon.svg')) {
      expect(asset.options.chimney).not.toBe(false);
    }
  });

  it('makes the maskable and Apple icons full bleed, the manifest `any` icons rounded', () => {
    expect(byFile('icons/icon-maskable-512.png')?.options).toMatchObject({ safeZone: true });
    expect(byFile('icons/icon-maskable-512.png')?.options.cornerRadius).toBeUndefined();
    expect(byFile('icons/apple-touch-icon.png')?.options.cornerRadius).toBeUndefined();
    expect(byFile('icons/icon-192.png')?.options.cornerRadius).toBeGreaterThan(0);
  });
});
