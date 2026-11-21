import { describe, expect, it } from 'vitest';
import { report } from './dry-run';
import { parseNotes } from './parse-notes';
import { toImportDraft, type ImportCategory } from './to-draft';

const cats: ImportCategory[] = [
  { id: 'c1', name: 'Health', slug: 'health' },
  { id: 'c2', name: 'Travel', slug: 'travel' },
];

const parse = (lines: string[]) => parseNotes(lines.join('\n'), 'markdown').rows;
const lineOf = (lines: string[], start: string): number =>
  lines.findIndex((l) => l.startsWith(start)) + 1;

describe('report (dry run, US4)', () => {
  const lines = [
    '## No category',
    'body',
    '',
    '# Health',
    '## ' + 'x'.repeat(121),
    '',
    '## Long body',
    '',
    'y'.repeat(2001),
    '',
    '## Unknown field',
    'colour: red',
    '',
    'body',
    '',
    '## Bad address',
    'source: ftp:/nope',
    '',
    '## Repeated',
    'type: text',
    'type: link',
    '',
    '# Elsewhere',
    '## Unmatched',
    'body',
  ];

  it('reports each problem with its line (strict)', () => {
    const { problems } = report(parse(lines), cats, { strict: true });
    const at = (n: number) => problems.filter((p) => p.line === n).map((p) => p.message);
    expect(at(lineOf(lines, '## No category')).join()).toMatch(/no category/i);
    expect(at(lineOf(lines, '## xxx')).join()).toMatch(/title.*120/i);
    expect(at(lineOf(lines, '## Long body')).join()).toMatch(/2000/);
    expect(at(lineOf(lines, 'colour:')).join()).toMatch(/unknown field/);
    expect(at(lineOf(lines, 'source:')).join()).toMatch(/http/);
    expect(at(lineOf(lines, 'type: link')).join()).toMatch(/repeated/);
    expect(at(lineOf(lines, '## Unmatched')).join()).toMatch(/Elsewhere.*matches no category/);
    expect(problems).toHaveLength(7);
  });

  it('does not flag an unmatched category when not strict', () => {
    const { problems } = report(parse(lines), cats, { strict: false });
    expect(problems.some((p) => /matches no category/.test(p.message))).toBe(false);
  });

  it('clean file: no problems, counts match toImportDraft, second categories counted', () => {
    const clean = [
      '# Health',
      '## One',
      'categories: travel',
      '',
      'a',
      '## Two',
      '',
      'b',
      '# Travel',
      '## Three',
      '',
      'c',
    ];
    const rows = parse(clean);
    const out = report(rows, cats, { strict: true });
    expect(out.problems).toEqual([]);
    expect(out.cards).toBe(rows.length);
    const expected: Record<string, number> = {};
    for (const row of rows) {
      for (const id of toImportDraft(row, cats, { strict: true }).categoryIds ?? []) {
        const name = cats.find((c) => c.id === id)!.name;
        expected[name] = (expected[name] ?? 0) + 1;
      }
    }
    expect(expected).toEqual({ Health: 2, Travel: 2 });
    expect(Object.fromEntries(out.categories.map((c) => [c.name, c.count]))).toEqual(expected);
  });
});

describe('report media checks (T060)', () => {
  const lines = [
    '# Health',
    '## A',
    'cover: ok.png',
    '',
    '## B',
    'cover: gone.png',
    '',
    '## C',
    'type: media',
    'image: x.xyz',
    '',
  ];
  const media = {
    fileExists: (p: string) => p !== 'gone.png',
    kindOf: (p: string) => (p.endsWith('.png') ? 'image' : null),
  };

  it('flags missing and unaccepted files with their line and path', () => {
    const r = report(parse(lines), cats, { media });
    expect(r.cards).toBe(1);
    expect(r.problems).toEqual([
      { line: 5, message: 'file "gone.png" not found' },
      { line: 8, message: 'file "x.xyz" is not an accepted kind' },
    ]);
  });

  it('only calls the injected checks (nothing uploaded)', () => {
    const calls: string[] = [];
    report(parse(lines), cats, {
      media: { fileExists: (p) => (calls.push(p), true), kindOf: () => 'image' },
    });
    expect(calls).toEqual(['ok.png', 'gone.png', 'x.xyz']);
  });
});
