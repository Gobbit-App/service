import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_BODY_MAX, CARD_TITLE_MAX } from '../limits';
import { parseSections } from './parse-sections';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseSections (D443)', () => {
  it('uses # as the category and ## as one card per section, with the ## line', () => {
    const { rows, problem, ignored } = parseSections(
      '# Town\n\n## One\nfirst\n\n## Two\nsecond\n\n# Parks\n\n## Three\nthird\n',
    );
    expect(problem).toBeNull();
    expect(ignored).toEqual([]);
    expect(rows.map((r) => [r.line, r.title, r.body, r.categories, r.type, r.error])).toEqual([
      [3, 'One', 'first', ['Town'], 'text', null],
      [6, 'Two', 'second', ['Town'], 'text', null],
      [11, 'Three', 'third', ['Parks'], 'text', null],
    ]);
  });

  it('trims blank edge lines but keeps the interior verbatim', () => {
    const { rows } = parseSections('# C\n## T\n\n\nA  b\n\n\n- x\n  - y\n**bold**\n\n\n# D\n');
    expect(rows[0]?.body).toBe('A  b\n\n\n- x\n  - y\n**bold**');
  });

  it('keeps ### and deeper headings as body', () => {
    const { rows } = parseSections('# C\n## T\n### Detail\ntext\n#### Deeper\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe('### Detail\ntext\n#### Deeper');
  });

  it('treats ## and # inside a code fence as body', () => {
    const { rows } = parseSections('# C\n## T\n```\n## not a card\n# not a category\n```\nafter\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe('```\n## not a card\n# not a category\n```\nafter');
    expect(rows[0]?.categories).toEqual(['C']);
    expect(parseSections('# C\n## T\n~~~\n## nope\n~~~\n').rows).toHaveLength(1);
  });

  it('reports text outside any section as ignored with its line', () => {
    const { rows, ignored } = parseSections('stray\n\n# C\nalso stray\n\n## T\nbody\n');
    expect(rows.map((r) => r.title)).toEqual(['T']);
    expect(ignored).toEqual([
      { line: 1, text: 'stray' },
      { line: 4, text: 'also stray' },
    ]);
  });

  it('gives a section before any # no category', () => {
    const { rows } = parseSections('## Lonely\nbody\n\n# C\n## Filed\nx\n');
    expect(rows.map((r) => [r.title, r.categories])).toEqual([
      ['Lonely', []],
      ['Filed', ['C']],
    ]);
  });

  it('flags a title over the limit with the ## line', () => {
    const { rows } = parseSections(`# C\n\n## ${'t'.repeat(CARD_TITLE_MAX + 1)}\nbody\n`);
    expect(rows[0]?.line).toBe(3);
    expect(rows[0]?.error).toEqual(expect.any(String));
  });

  it('flags a body over the limit (code points) with the ## line, and accepts the limit', () => {
    const over = parseSections(`# C\n## T\n${'😀'.repeat(CARD_BODY_MAX + 1)}\n`);
    expect(over.rows[0]?.line).toBe(2);
    expect(over.rows[0]?.error).toEqual(expect.any(String));
    const ok = parseSections(`# C\n## T\n${'😀'.repeat(CARD_BODY_MAX)}\n`);
    expect(ok.rows[0]?.error).toBeNull();
  });

  it('keeps an RTL body line after the fields as body', () => {
    const { rows } = parseSections('# C\n## T\ncategories: אתונה\nשורה בעברית\n');
    expect(rows[0]?.error).toBeNull();
    expect(rows[0]?.categories).toEqual(['C', 'אתונה']);
    expect(rows[0]?.body).toBe('שורה בעברית');
  });

  it('parses the Hebrew fixture: ignored lines, no-category card, fenced ## and ### as body', () => {
    const { rows, ignored } = parseSections(fixture('hebrew-health.md'));
    expect(ignored.map((i) => [i.line, i.text])).toEqual([
      [1, 'הערה לפני כל כותרת'],
      [7, 'טקסט חופשי מחוץ לכל סעיף.'],
    ]);
    expect(rows.map((r) => [r.line, r.title, r.categories[0] ?? null])).toEqual([
      [3, 'לפני הקטגוריה', null],
      [9, 'מרפאת השכונה', 'בריאות'],
      [21, 'נוהל כתובות', 'בריאות'],
      [33, 'מספרי טלפון', 'חירום'],
    ]);
    const addresses = rows.find((r) => r.title === 'נוהל כתובות');
    expect(addresses?.body).toBe('```\n## זו לא כותרת\n```\n\n### פירוט\n\nגוף עם כותרת משנה.');
  });

  it('parses the English fixture sections and keeps an empty card with an empty body', () => {
    const { rows } = parseSections(fixture('english-city.md'));
    expect(rows.map((r) => r.title)).toEqual([
      'Parking permits',
      'Library',
      'Dog park',
      'Empty card',
    ]);
    expect(rows[3]?.body).toBe('');
  });

  describe('field lines (D444)', () => {
    const one = (md: string) => parseSections(md).rows[0];

    it('parses source, categories and type, keys case-insensitive, body after', () => {
      const r = one('# C\n## T\nSource: https://a.test/x\nType: link\ncategories: a\n\nbody\n');
      expect(r?.error).toBeNull();
      expect(r?.type).toBe('link');
      expect(r?.sourceUrl).toBe('https://a.test/x');
      expect(r?.categories).toEqual(['C', 'a']);
      expect(r?.body).toBe('body');
    });

    it('takes a link card URL from source; type text keeps text', () => {
      expect(one('# C\n## T\ntype: text\nsource: http://a.test\n')?.type).toBe('text');
      expect(one('# C\n## T\nsource: https://a.test\n')?.sourceUrl).toBe('https://a.test');
    });

    it('splits categories on , ، and ，, trims, de-duplicates by matchCategory key', () => {
      const r = one('# Town\n## T\ncategories:  Parks ،Food Court，food-court, town , parks,\n');
      expect(r?.error).toBeNull();
      expect(r?.categories).toEqual(['Town', 'Parks', 'Food Court']);
    });

    it('de-duplicates NFC-equivalent categories', () => {
      const r = one('# C\n## T\ncategories: e\u0301, \u00e9\n');
      expect(r?.categories).toHaveLength(2);
    });

    it('errors on a type other than text/link', () => {
      const r = one('# C\n## T\ntype: video\n');
      expect(r?.error).toMatch(/type/);
      expect(r?.error).toMatch(/3/);
    });

    it('errors on type: link without source', () => {
      expect(one('# C\n## T\ntype: link\n')?.error).toMatch(/source/);
    });

    it.each([
      ['unknown key', 'color: red', 'color'],
      ['empty value', 'categories:   ', 'categories'],
      ['malformed source', 'source: ftp://a.test', 'source'],
      ['source not an address', 'source: not a url', 'source'],
    ])('row error naming key and line: %s', (_n, field, key) => {
      const r = one(`# C\n## T\n${field}\n`);
      expect(r?.error).toContain(key);
      expect(r?.error).toMatch(/\b3\b/);
    });

    it('errors on a repeated key at the repeat line', () => {
      const r = one('# C\n## T\nsource: https://a.test\nsource: https://b.test\n');
      expect(r?.error).toContain('source');
      expect(r?.error).toMatch(/\b4\b/);
    });

    it('reads a key: value line after the body started as body', () => {
      const r = one('# C\n## T\nfirst line\nsource: https://a.test\n');
      expect(r?.error).toBeNull();
      expect(r?.sourceUrl).toBeNull();
      expect(r?.body).toBe('first line\nsource: https://a.test');
    });

    it('ends the field block at a blank line', () => {
      const r = one('# C\n## T\ncategories: a\n\nsource: https://a.test\n');
      expect(r?.error).toBeNull();
      expect(r?.sourceUrl).toBeNull();
      expect(r?.body).toBe('source: https://a.test');
    });

    it.each([['cover: a.png'], ['image: a.png'], ['type: media']])(
      'refuses media for now (T027a): %s',
      (field) => {
        const r = one(`# C\n## T\n${field}\n`);
        expect(r?.error).toContain('media is not supported yet');
        expect(r?.error).toContain(field.split(':')[0]);
        expect(r?.error).toMatch(/\b3\b/);
      },
    );
  });
});
