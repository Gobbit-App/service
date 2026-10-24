import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_BODY_MAX } from '../limits';
import { detectFormat, parseNotes } from './parse-notes';
import { matchCategory, toImportDraft } from './to-draft';
import type { ImportRow } from './constants';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const brief = (rows: ImportRow[]) =>
  rows.map(({ line, type, title, body, sourceUrl, category, error }) => ({
    line,
    type,
    title,
    body,
    sourceUrl,
    category,
    error,
  }));

describe('parseNotes lines (D189)', () => {
  const { rows, problem } = parseNotes(fixture('street-notes.txt'), 'lines');

  it('makes one card per line and skips blank and separator lines', () => {
    expect(problem).toBeNull();
    expect(rows.map((r) => r.line)).toEqual([1, 3, 4, 5, 6, 7, 8, 10]);
  });

  it('splits title — body, title: body and a list marker', () => {
    expect(brief(rows.filter((r) => [3, 4, 6].includes(r.line)))).toEqual([
      expect.objectContaining({ title: 'Clinic', body: 'Open Sun–Thu 8–14, closed on holidays' }),
      expect.objectContaining({ title: 'Recycling', body: 'Bins are emptied on Tuesday mornings' }),
      expect.objectContaining({ title: 'Library', body: 'Returns go in the box by the door' }),
    ]);
  });

  it('turns a URL-only line into a link card titled by the URL', () => {
    expect(rows.find((r) => r.line === 5)).toMatchObject({
      type: 'link',
      title: 'example.org/forms',
      body: '',
      sourceUrl: 'https://example.org/forms',
    });
  });

  it('keeps a URL inside a line as sourceUrl and out of the title', () => {
    expect(rows.find((r) => r.line === 8)).toMatchObject({
      type: 'text',
      title: 'Pool timetable',
      sourceUrl: 'https://example.org/pool/timetable',
    });
  });

  it('takes the first sentence as the title of a long line, the full line as the body', () => {
    const bakery = rows.find((r) => r.line === 7)!;
    expect(bakery.title).toBe('Bakery on the corner opens at six');
    expect(bakery.body).toMatch(/^Bakery on the corner opens at six\. They sell out/);
  });

  it('shortens a long line without a sentence end at a word and keeps the full body', () => {
    const hardware = rows.find((r) => r.line === 10)!;
    expect(hardware.title).toMatch(/…$/);
    expect([...hardware.title].length).toBeLessThanOrEqual(80);
    expect(hardware.body).toMatch(/until noon$/);
  });

  it('handles Hebrew notes', () => {
    const hebrew = parseNotes(fixture('hebrew.txt'), 'lines').rows;
    expect(brief(hebrew).map(({ title, body }) => ({ title, body }))).toEqual([
      { title: 'מרפאה', body: 'פתוח א׳–ה׳ 8–14' },
      { title: 'מחזור', body: 'הפחים מתרוקנים בימי שלישי' },
      {
        title: 'ספרייה שכונתית פתוחה עד שמונה בערב',
        body: 'ספרייה שכונתית פתוחה עד שמונה בערב. ההחזרות נכנסות לתיבה ליד הדלת.',
      },
    ]);
  });

  it('does not split on a separator whose title would be too long', () => {
    const long = `${'word '.repeat(20).trim()} — body`;
    const [row] = parseNotes(long, 'lines').rows;
    expect(row!.title).not.toBe('word '.repeat(20).trim());
  });

  it('marks a line over the body limit with the reason', () => {
    const [row] = parseNotes('x'.repeat(CARD_BODY_MAX + 1), 'lines').rows;
    expect(row!.error).toBe(`Longer than ${CARD_BODY_MAX} characters (${CARD_BODY_MAX + 1})`);
  });
});

describe('parseNotes markdown (D189)', () => {
  const { rows } = parseNotes(fixture('street-notes.md'), 'markdown');

  it('uses headings as categories and list items and paragraphs as cards', () => {
    expect(brief(rows)).toEqual([
      {
        line: 3,
        type: 'text',
        title: 'Clinic',
        body: 'Open Sun–Thu 8–14',
        sourceUrl: null,
        category: 'Health',
        error: null,
      },
      {
        line: 4,
        type: 'link',
        title: 'Pharmacy rota',
        body: '',
        sourceUrl: 'https://example.org/pharmacy',
        category: 'Health',
        error: null,
      },
      {
        line: 5,
        type: 'text',
        title: 'Pharmacy night hours',
        body: 'see the rota',
        sourceUrl: null,
        category: 'Health',
        error: null,
      },
      {
        line: 9,
        type: 'text',
        title: 'Bins are emptied on Tuesday mornings',
        body: 'Bins are emptied on Tuesday mornings. Glass goes to the green bin by the park.',
        sourceUrl: null,
        category: 'Recycling',
        error: null,
      },
      {
        line: 20,
        type: 'text',
        title: 'Lost & found',
        body: 'ask at the community office',
        sourceUrl: 'https://example.org/office',
        category: 'Recycling',
        error: null,
      },
      {
        line: 22,
        type: 'text',
        title: 'Bulky waste',
        body: 'book a pickup a week ahead',
        sourceUrl: null,
        category: 'Recycling',
        error: null,
      },
    ]);
  });

  it('skips rules, images and code fences', () => {
    expect(rows.some((r) => /not a card|map/.test(r.title))).toBe(false);
  });
});

describe('parseNotes csv (D189)', () => {
  const { rows, problem } = parseNotes(fixture('street-notes.csv'), 'csv');

  it('reads quoted commas and line breaks, a BOM and headers in any case', () => {
    expect(problem).toBeNull();
    expect(rows[0]).toMatchObject({
      line: 2,
      title: 'Clinic',
      body: 'Open Sun–Thu, 8–14',
      category: 'Health',
    });
    expect(rows[1]).toMatchObject({
      line: 3,
      title: 'Pool',
      body: 'Lanes:\nmorning 6–8\nevening 18–21',
    });
  });

  it('splits the body when the title is missing and makes a link card from url', () => {
    expect(rows[2]).toMatchObject({ title: 'Recycling', body: 'Bins are emptied on Tuesday' });
    expect(rows[3]).toMatchObject({
      type: 'link',
      title: 'Forms',
      sourceUrl: 'https://example.org/forms',
    });
  });

  it('flags a bad url and skips empty records', () => {
    expect(rows[4]).toMatchObject({ title: 'Broken', error: 'The url is not an http(s) address' });
    expect(rows).toHaveLength(5);
  });

  it('refuses a CSV without a title or body column', () => {
    expect(parseNotes('name,phone\nDan,050', 'csv')).toEqual({
      rows: [],
      problem: 'The first CSV row needs a title or body column',
    });
  });

  it('works with only a body column', () => {
    expect(parseNotes('body\nClinic: open at 8', 'csv').rows[0]).toMatchObject({
      title: 'Clinic',
      body: 'open at 8',
    });
  });
});

describe('detectFormat (D189)', () => {
  it.each([
    ['a,b', 'notes.csv', 'csv'],
    ['plain', 'notes.md', 'markdown'],
    ['intro\n# Health\n- x', 'notes.txt', 'markdown'],
    ['# Health', null, 'markdown'],
    ['Clinic — open\n#hashtag', null, 'lines'],
    ['Clinic — open', 'NOTES.TXT', 'lines'],
  ] as const)('%j (%s) → %s', (text, name, format) => {
    expect(detectFormat(text, name)).toBe(format);
  });
});

describe('toImportDraft (D190)', () => {
  const categories = [
    { id: 'c1', name: 'Health', slug: 'health' },
    { id: 'c2', name: 'Bulky waste', slug: 'bulky-waste' },
  ];
  const row = (category: string | null, extra: Partial<ImportRow> = {}): ImportRow => ({
    line: 1,
    type: 'text',
    title: ' Clinic ',
    body: 'Open',
    sourceUrl: null,
    category,
    error: null,
    ...extra,
  });

  it('maps a category name to an existing id by name or slug, case-insensitive', () => {
    expect(toImportDraft(row('health'), categories).categoryIds).toEqual(['c1']);
    expect(matchCategory('bulky  Waste', categories)?.id).toBe('c2');
  });

  it('suggests an unknown category as newCategory', () => {
    expect(toImportDraft(row('Sport'), categories)).toEqual({
      type: 'text',
      title: 'Clinic',
      body: 'Open',
      newCategory: 'Sport',
    });
  });

  it('keeps sourceUrl and omits the category when there is none', () => {
    expect(
      toImportDraft(row(null, { type: 'link', sourceUrl: 'https://example.org' }), categories),
    ).toEqual({ type: 'link', title: 'Clinic', body: 'Open', sourceUrl: 'https://example.org' });
  });
});
