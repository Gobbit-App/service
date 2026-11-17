import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * D416 (docs/design/ui-system.md): ratchets on the UI system. jsdom renders no CSS, so these read
 * the sources. Lower a baseline when you remove offenders; never raise it.
 */
// Vitest stubs CSS imports, so the stylesheets are read from disk.
const root = `${import.meta.dirname}/`;
const css = Object.fromEntries(
  globSync('**/*.css', { cwd: root }).map((file) => [file, readFileSync(root + file, 'utf8')]),
);
const tsx = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Class names in use today with no CSS rule (test hooks, legacy). New ones need a rule. */
const UNSTYLED_BASELINE = new Set<string>([
  'about',
  'account-settings',
  'bottom-bar__menu',
  'browse-button',
  'browse-list',
  'browse-page--state',
  'calc-card__label',
  'composer-dock__save',
  'empty-state__action',
  'empty-state__title',
  'entity-chips__chip',
  'event-card',
  'event-fields__link',
  'event-log__scope',
  'event-row__line',
  'event-row__title',
  'file-fields',
  'gallery-card',
  'gallery-fields',
  'image-fields',
  'item-list',
  'media-player--audio',
  'media-player--video',
  'media-unavailable',
  'new-category__add',
  'new-category__cancel',
  'new-deck',
  'reminder-fields',
  'review-diff__row',
  'review-edit',
  'review-pill',
  'rich-editor__root',
  'search-page',
  'share-button',
  'share-form',
  'shares',
  'toast__message',
  'token-form',
]);
const RAW_SPACING_BASELINE = 193;
const RAW_FONT_SIZE_BASELINE = 69;
const BREAKPOINTS = new Set(['479.98px', '480px', '600px', '767.98px', '768px']);
/** Legacy breakpoints (ui-system.md §3); remove as they go, never add. */
const LEGACY_BREAKPOINTS = new Set(['400px', '760px', '767px']);

const allCss = Object.values(css).join('\n');
const declarations = (pattern: RegExp) =>
  Object.entries(css).flatMap(([file, text]) =>
    text
      .split('\n')
      .map((line, i) => ({ line: line.trim(), at: `${file}:${i + 1}` }))
      .filter(({ line }) => pattern.test(line)),
  );

function classesInUse(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [file, text] of Object.entries(tsx)) {
    for (const m of text.matchAll(
      /className=(?:"([^"]*)"|\{\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)"))/g,
    )) {
      const value = m.slice(1).find((g) => g !== undefined) ?? '';
      // A name glued to `${…}` is a modifier prefix (`share-row--${state}`), not a class.
      const literal = value.replace(/[\w-]*\$\{[^}]*\}[\w-]*/g, ' ');
      for (const name of literal.split(/\s+/).filter((c) => /^[a-z][\w-]*$/i.test(c))) {
        if (!found.has(name)) found.set(name, file);
      }
    }
  }
  return found;
}

describe('UI system (D416)', () => {
  it('finds the sources', () => {
    expect(Object.keys(css).length).toBeGreaterThan(10);
    expect(Object.keys(tsx).length).toBeGreaterThan(50);
  });

  it('every class a component uses has a CSS rule', () => {
    const styled = new Set([...allCss.matchAll(/\.([a-z][\w-]*)/gi)].map((m) => m[1]));
    const unstyled = [...classesInUse()]
      .filter(([name]) => !styled.has(name) && !UNSTYLED_BASELINE.has(name))
      .map(
        ([name, file]) =>
          `.${name} (${file}): give it a rule or use a layout class (ui-system.md §2)`,
      );
    expect(unstyled).toEqual([]);
  });

  it('the unstyled baseline only lists classes still used without a rule', () => {
    const styled = new Set([...allCss.matchAll(/\.([a-z][\w-]*)/gi)].map((m) => m[1]));
    const used = classesInUse();
    const stale = [...UNSTYLED_BASELINE].filter((name) => styled.has(name) || !used.has(name));
    expect(stale, 'remove these from UNSTYLED_BASELINE').toEqual([]);
  });

  it('spacing uses tokens, not raw px', () => {
    const raw = declarations(
      /^(gap|row-gap|column-gap|margin[\w-]*|padding[\w-]*):[^;]*\b[1-9]\d*px/,
    );
    expect(raw.length, raw.map((r) => r.at).join('\n')).toBeLessThanOrEqual(RAW_SPACING_BASELINE);
  });

  it('font sizes use tokens', () => {
    const raw = declarations(/^font-size:\s*[\d.]+(rem|px|em)\b/);
    expect(raw.length, raw.map((r) => r.at).join('\n')).toBeLessThanOrEqual(RAW_FONT_SIZE_BASELINE);
  });

  it('media queries use the listed breakpoints', () => {
    const off = [...allCss.matchAll(/\((?:min|max)-width:\s*([\d.]+px)\)/g)]
      .map((m) => m[1])
      .filter((bp) => !BREAKPOINTS.has(bp) && !LEGACY_BREAKPOINTS.has(bp));
    expect(off).toEqual([]);
  });
});
