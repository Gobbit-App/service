import { describe, expect, it } from 'vitest';

/** D210: controls draw icons from `ui/icons`, never Unicode glyphs. */
const GLYPHS = /[◂▸⚙✕✖×★☆⤴↑↓←→‹›⋯]/u;

const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('no glyph icons', () => {
  it('finds the component sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it('no component renders a Unicode arrow, star, cross or gear', () => {
    const offenders = Object.entries(sources).flatMap(([file, text]) =>
      text
        .split('\n')
        .map((line, i) => ({ line, i }))
        // Comments may still name the old glyphs.
        .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line) && GLYPHS.test(line))
        .map(({ line, i }) => `${file}:${i + 1}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
