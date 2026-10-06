import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori, { type Font } from 'satori';
import { OG_HEIGHT, OG_WIDTH, type OgNode } from './og-template';

/** Renders an OG element tree to a 1200×630 PNG. */
export type OgRenderer = (tree: OgNode) => Promise<Uint8Array>;

const require = createRequire(import.meta.url);

/** D60: Inter (Latin + Greek subsets) and Noto Sans Hebrew, OFL, shipped by @fontsource as WOFF. */
const FONT_FILES: { pkg: string; file: string; name: string; weight: 400 | 700 }[] = [
  { pkg: '@fontsource/inter', file: 'inter-latin-400-normal.woff', name: 'Inter', weight: 400 },
  { pkg: '@fontsource/inter', file: 'inter-latin-700-normal.woff', name: 'Inter', weight: 700 },
  { pkg: '@fontsource/inter', file: 'inter-greek-400-normal.woff', name: 'Inter', weight: 400 },
  { pkg: '@fontsource/inter', file: 'inter-greek-700-normal.woff', name: 'Inter', weight: 700 },
  {
    pkg: '@fontsource/noto-sans-hebrew',
    file: 'noto-sans-hebrew-hebrew-400-normal.woff',
    name: 'Noto Sans Hebrew',
    weight: 400,
  },
  {
    pkg: '@fontsource/noto-sans-hebrew',
    file: 'noto-sans-hebrew-hebrew-700-normal.woff',
    name: 'Noto Sans Hebrew',
    weight: 700,
  },
];

/** The packages only export CSS, so the font files are located next to their LICENSE. */
function fontPath(pkg: string, file: string): string {
  return join(dirname(require.resolve(`${pkg}/LICENSE`)), 'files', file);
}

async function loadFonts(): Promise<Font[]> {
  return Promise.all(
    FONT_FILES.map(async ({ pkg, file, name, weight }) => ({
      name,
      weight,
      style: 'normal' as const,
      data: await readFile(fontPath(pkg, file)),
    })),
  );
}

/** Renders an element tree to SVG or PNG at any size (OG images and the static app icons). */
export type TreeRenderer = {
  svg: (tree: OgNode, width: number, height: number) => Promise<string>;
  png: (tree: OgNode, width: number, height: number) => Promise<Uint8Array>;
};

/** Loads the fonts once and returns a renderer that reuses them. */
export async function createTreeRenderer(): Promise<TreeRenderer> {
  const fonts = await loadFonts();

  // Satori's element type is React's; the plain-object tree has the same runtime shape.
  const svg = (tree: OgNode, width: number, height: number): Promise<string> =>
    satori(tree as unknown as Parameters<typeof satori>[0], { width, height, fonts });

  return {
    svg,
    png: async (tree, width, height) => {
      const markup = await svg(tree, width, height);
      const png = new Resvg(markup, { fitTo: { mode: 'width', value: width } }).render().asPng();
      return new Uint8Array(png);
    },
  };
}

/** D60: the 1200×630 share-preview renderer. */
export async function createOgRenderer(): Promise<OgRenderer> {
  const renderer = await createTreeRenderer();
  return (tree) => renderer.png(tree, OG_WIDTH, OG_HEIGHT);
}
