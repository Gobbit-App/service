import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest stubs CSS imports (even `?raw`), so the sheets are read from disk.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const styles = read('./styles.css');
const editorCss = read('./editor/editor.css');
const browseCss = read('./browse/browse.css');

/**
 * D383: each colour token of the first `:root { … }` block is `light-dark(#light, #dark)`; returns
 * the side of every such token for one theme.
 */
function tokens(css: string, side: 'light' | 'dark'): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\);/gi)].map(
      (m) => [m[1], side === 'light' ? m[2] : m[3]],
    ),
  );
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = tokens(styles, 'light');
const dark = tokens(styles, 'dark');

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast (D214)', (_name, theme) => {
  const color = (name: string) => {
    const value = theme[name];
    if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a hex colour`);
    return value;
  };

  it('keeps the destructive colour at 4.5:1 or more on the surface and background', () => {
    expect(contrast(color('--color-danger'), color('--color-surface'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color('--color-danger'), color('--color-bg'))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps primary button text at 4.5:1 or more on the mint fill', () => {
    expect(
      contrast(color('--color-accent-text'), color('--color-accent-fill')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  // D272/D383: every text pair of the palette meets WCAG AA for normal text.
  it.each([
    ['--color-text', '--color-bg'],
    ['--color-text', '--color-surface'],
    ['--color-text', '--color-accent-soft'],
    ['--color-text', '--color-highlight'],
    ['--color-muted', '--color-bg'],
    ['--color-muted', '--color-surface'],
    ['--color-muted', '--color-accent-soft'],
    ['--color-accent', '--color-bg'],
    ['--color-accent', '--color-surface'],
    ['--color-banner-text', '--color-banner'],
    // Cards swap in the 30% surface (cream / carbon) for the page tokens.
    ['--color-text', '--card-bg'],
    ['--color-text', '--card-well'],
    ['--color-text', '--card-pane'],
    ['--color-text', '--card-accent-soft'],
    ['--card-muted', '--card-bg'],
    ['--card-muted', '--card-well'],
    ['--card-muted', '--card-accent-soft'],
    ['--color-accent', '--card-bg'],
    ['--color-danger', '--card-bg'],
  ])('keeps %s on %s at 4.5:1 or more', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps icon-only controls (muted) at 3:1 or more', () => {
    expect(contrast(color('--color-muted'), color('--color-surface'))).toBeGreaterThanOrEqual(3);
    expect(contrast(color('--color-muted'), color('--color-bg'))).toBeGreaterThanOrEqual(3);
  });
});

/** Selectors (comma-split) of every rule in `css`, comments removed. */
function selectors(css: string): string[] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...plain.matchAll(/([^{}]+)\{/g)].flatMap((m) =>
    (m[1] ?? '').split(',').map((s) => s.trim()),
  );
}

describe('shared control styles (D211, D214)', () => {
  it('defines one destructive button style', () => {
    expect(selectors(styles).filter((s) => s === '.button--danger')).toHaveLength(1);
  });

  it.each([
    ['editor.css', editorCss],
    ['browse.css', browseCss],
  ])('%s never restyles the shared controls unscoped', (_file, css) => {
    const leaking = selectors(css).filter((s) =>
      /^\.(button|icon-button|menu|menu__item|menu-button)(\b|$)(?![-_])/.test(s),
    );
    expect(leaking).toEqual([]);
  });
});

describe('theme switching (D383)', () => {
  it('follows color-scheme only, so a theme picked in Settings wins over the device', () => {
    expect(styles).not.toContain('prefers-color-scheme');
    expect(styles).toMatch(/:root\[data-theme='light'\]\s*\{\s*color-scheme: light;/);
    expect(styles).toMatch(/:root\[data-theme='dark'\]\s*\{\s*color-scheme: dark;/);
  });

  it('defines every core colour for both themes', () => {
    for (const name of ['--color-bg', '--color-surface', '--color-text', '--color-accent-fill']) {
      expect(light[name]).toMatch(/^#/);
      expect(dark[name]).toMatch(/^#/);
    }
  });
});

describe('modal scroll lock', () => {
  it('locks the root scroller while a modal dialog or aria-modal layer is open', () => {
    const lock = /html:has\(dialog:modal, \[aria-modal='true'\]\)\s*\{\s*overflow: hidden;/;
    expect(styles).toMatch(lock);
  });
});
