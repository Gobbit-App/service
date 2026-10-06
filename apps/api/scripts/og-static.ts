/**
 * D60: renders the static images the web image serves, with the same fonts and template code as
 * the live OG renderer, and writes them to `apps/web/public` (committed; the web build never
 * depends on the API). Re-run with `pnpm og:static` when the templates change.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATIC_ICONS, iconTree } from '../src/share/icon-template';
import { OG_HEIGHT, OG_WIDTH, privateCardTree } from '../src/share/og-template';
import { createTreeRenderer } from '../src/share/render';
import { PRIVATE_OG_IMAGE_PATH } from '../src/share/share.service';

const PUBLIC_DIR = fileURLToPath(new URL('../../web/public', import.meta.url));
const FAVICON_SIZE = 64;

async function write(file: string, data: string | Uint8Array): Promise<void> {
  const path = join(PUBLIC_DIR, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  console.log(`wrote ${path}`);
}

async function main(): Promise<void> {
  const renderer = await createTreeRenderer();

  await write(
    PRIVATE_OG_IMAGE_PATH.slice(1),
    await renderer.png(privateCardTree(), OG_WIDTH, OG_HEIGHT),
  );

  for (const { file, size, variant } of STATIC_ICONS) {
    await write(file, await renderer.png(iconTree(size, variant), size, size));
  }

  // Satori outlines glyphs as paths, so the favicon needs no font at runtime.
  await write(
    'favicon.svg',
    `${await renderer.svg(iconTree(FAVICON_SIZE), FAVICON_SIZE, FAVICON_SIZE)}\n`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
