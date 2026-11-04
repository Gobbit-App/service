/**
 * D321: every logo file the web image serves, rendered by `pnpm og:static` into
 * `apps/web/public` (paths are relative to it). The manifest, `index.html`, the public pages and
 * the sign-in header reference these paths.
 */
import { TILE_PALETTE, type LogoOptions } from './logo';

export type BrandAsset = {
  file: string;
  options: LogoOptions;
  /** Rasterise to a square PNG this many pixels wide; omitted for SVG files. */
  png?: number;
};

/** The rounded app tile (iOS/Android-style squircle radius). */
const TILE_RADIUS = 0.22;
const ROUNDED: LogoOptions = { palette: TILE_PALETTE, cornerRadius: TILE_RADIUS, pad: 60 };

/** Public path of the header logo (sign-in screen, public pages, landing page). */
export const HEADER_LOGO_PATH = '/icons/logo.svg';
/** The header logo, also embedded in the OG images. */
export const HEADER_LOGO_OPTIONS: LogoOptions = { ...ROUNDED, px: 64 };
/** Below ~64 px the rising bits blur, so the favicon and small lockups drop the chimney. */
export const SMALL_LOGO_OPTIONS: LogoOptions = { ...ROUNDED, chimney: false, pad: 40, px: 64 };

export const BRAND_ASSETS: BrandAsset[] = [
  { file: 'favicon.svg', options: SMALL_LOGO_OPTIONS },
  { file: HEADER_LOGO_PATH.slice(1), options: HEADER_LOGO_OPTIONS },
  // Manifest `any`: rounded tile on transparent corners.
  { file: 'icons/icon-192.png', options: ROUNDED, png: 192 },
  { file: 'icons/icon-512.png', options: ROUNDED, png: 512 },
  // Manifest `maskable`: full bleed, content inside the safe zone (launchers crop it).
  {
    file: 'icons/icon-maskable-512.png',
    options: { palette: TILE_PALETTE, safeZone: true },
    png: 512,
  },
  // iOS fills transparency with black and rounds the corners itself: opaque and full bleed.
  { file: 'icons/apple-touch-icon.png', options: { palette: TILE_PALETTE, pad: 60 }, png: 180 },
];
