/**
 * D60: renders the static images the web image serves, with the same fonts and template code as
 * the live OG renderer, and writes them to `apps/web/public` (committed; the web build never
 * depends on the API). D321: the favicon, app icons and header logo come from the brand mark,
 * which is also written to `docs/brand`. Re-run with `pnpm og:static` when either changes.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_ASSETS, HEADER_LOGO_OPTIONS } from '../src/brand/app-icons';
import { logo } from '../src/brand/logo';
import {
  LANDING_OG_IMAGE_PATH,
  OG_HEIGHT,
  OG_WIDTH,
  landingTree,
  privateCardTree,
} from '../src/share/og-template';
import { createTreeRenderer, svgToPng } from '../src/share/render';
import { PRIVATE_OG_IMAGE_PATH } from '../src/share/share.service';

const PUBLIC_DIR = fileURLToPath(new URL('../../web/public', import.meta.url));
const DOCS_BRAND_DIR = fileURLToPath(new URL('../../../docs/brand', import.meta.url));

async function write(dir: string, file: string, data: string | Uint8Array): Promise<void> {
  const path = join(dir, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  console.log(`wrote ${path}`);
}

async function main(): Promise<void> {
  const renderer = await createTreeRenderer();

  await write(
    PUBLIC_DIR,
    PRIVATE_OG_IMAGE_PATH.slice(1),
    await renderer.png(privateCardTree(), OG_WIDTH, OG_HEIGHT),
  );
  await write(
    PUBLIC_DIR,
    LANDING_OG_IMAGE_PATH.slice(1),
    await renderer.png(landingTree(), OG_WIDTH, OG_HEIGHT),
  );

  for (const { file, options, png } of BRAND_ASSETS) {
    const svg = logo(options);
    await write(PUBLIC_DIR, file, png ? svgToPng(svg, png) : `${svg}\n`);
  }

  await write(DOCS_BRAND_DIR, 'logo.svg', `${logo()}\n`);
  await write(DOCS_BRAND_DIR, 'logo-app-icon.svg', `${logo(HEADER_LOGO_OPTIONS)}\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
