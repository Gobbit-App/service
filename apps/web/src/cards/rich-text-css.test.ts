// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PALETTE, PALETTE_COLORS } from '@gobbit/shared/rich-text';
import { describe, expect, it } from 'vitest';

// Vitest stubs CSS imports, so the sheet is read from disk.
const css = readFileSync(new URL('./rich-text.css', import.meta.url), 'utf8');

describe('cards/rich-text.css (FR-007)', () => {
  it.each(PALETTE_COLORS)('%s matches the shared palette in both themes', (name) => {
    expect(css).toContain(
      `--rt-${name}: light-dark(${PALETTE[name].light}, ${PALETTE[name].dark});`,
    );
    expect(css).toContain(`.rt-color--${name} {\n  color: var(--rt-${name});`);
  });

  // D383: the theme can be pinned in Settings, so colours follow color-scheme, not the media query.
  it('never switches on prefers-color-scheme', () => {
    expect(css).not.toContain('prefers-color-scheme');
  });

  it('defines both sizes', () => {
    expect(css).toMatch(/\.rt-small \{/);
    expect(css).toMatch(/\.rt-large \{/);
  });
});
