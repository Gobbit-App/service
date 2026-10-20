/** A chunk entry in the Vite build manifest. */
export type ManifestChunk = {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
};

/** The Vite build manifest mapping source keys to chunks. */
export type ViteManifest = Record<string, ManifestChunk>;

/** Collects all initial chunk files by following static imports transitively. */
export function initialChunkFiles(manifest: ViteManifest): string[] {
  const files = new Set<string>();
  const visited = new Set<string>();

  const visit = (key: string): void => {
    if (visited.has(key)) {
      return;
    }
    visited.add(key);

    const chunk = manifest[key];
    if (!chunk) {
      return;
    }

    if (chunk.file && chunk.file.endsWith('.js')) {
      files.add(chunk.file);
    }

    if (chunk.imports) {
      for (const importKey of chunk.imports) {
        visit(importKey);
      }
    }
  };

  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk.isEntry) {
      visit(key);
    }
  }

  return Array.from(files).sort();
}

/** An entry in the bundle budget with file path and gzipped size. */
export type BudgetEntry = { file: string; gzipBytes: number };

/** Checks if total gzipped size of entries is within the limit. */
export function checkBudget(
  entries: readonly BudgetEntry[],
  limitBytes: number,
): { totalBytes: number; ok: boolean } {
  const totalBytes = entries.reduce((sum, entry) => sum + entry.gzipBytes, 0);
  return { totalBytes, ok: totalBytes <= limitBytes };
}

/**
 * D139: lazy-only libraries, found by config keys that survive minification. `@use-gesture`
 * belongs to the Browse chunk; in an initial chunk it would cost every page load.
 */
export const LAZY_ONLY_MARKERS: readonly { library: string; markers: readonly string[] }[] = [
  { library: '@use-gesture', markers: ['preventScrollAxis', 'lockDirection'] },
];

/** The lazy-only libraries found in initial chunks, as `library in file` strings. */
export function lazyOnlyViolations(
  chunks: readonly { file: string; code: string }[],
  rules = LAZY_ONLY_MARKERS,
): string[] {
  return chunks.flatMap(({ file, code }) =>
    rules
      .filter(({ markers }) => markers.some((marker) => code.includes(marker)))
      .map(({ library }) => `${library} in ${file}`),
  );
}
