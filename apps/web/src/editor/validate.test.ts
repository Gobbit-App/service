import { describe, expect, it } from 'vitest';
import { itemCreateSchema } from '@gobbit/shared';
import { validateCalcExpression } from '@gobbit/shared/calc';
import { emptyDraft, toCreateBody, type Draft } from './draft';
import { errorCount, isHttpUrl, payloadBytes, validateDraft } from './validate';

const CAT = '00000000-0000-4000-8000-0000000000c1';
const calcExpression = validateCalcExpression;

function draft(overrides: Partial<Draft> = {}): Draft {
  return { ...emptyDraft('text', CAT), title: 'A card', ...overrides };
}

const table = (columns: string[], rows: string[][]): Draft =>
  draft({ type: 'table', payload: { columns, rows } });

const calc = (
  fields: { key: string; label: string; unit?: string; default?: string }[],
  expression = 'a',
  resultLabel = 'R',
): Draft =>
  draft({
    type: 'calc',
    payload: {
      fields: fields.map((f) => ({ unit: '', default: '', ...f })),
      expression,
      resultLabel,
    },
  });

describe('validateDraft: common fields', () => {
  it('accepts a minimal text card', () => {
    expect(validateDraft(draft())).toEqual({});
  });

  it('requires a non-blank title', () => {
    expect(validateDraft(draft({ title: '   ' }))).toHaveProperty('title');
  });

  it('counts the title in code points (emoji count once)', () => {
    expect(validateDraft(draft({ title: '😀'.repeat(120) }))).toEqual({});
    expect(validateDraft(draft({ title: '😀'.repeat(121) }))).toHaveProperty('title');
  });

  it('counts the body in code points: emoji, Hebrew and combining marks', () => {
    expect(validateDraft(draft({ body: '😀'.repeat(600) }))).toEqual({});
    expect(validateDraft(draft({ body: 'ש'.repeat(601) }))).toHaveProperty('body');
    // "é" as e + U+0301 is two code points.
    expect(validateDraft(draft({ body: 'é'.repeat(300) }))).toEqual({});
    expect(validateDraft(draft({ body: 'é'.repeat(300) + 'x' }))).toHaveProperty('body');
  });

  it('needs at least one category', () => {
    expect(validateDraft(draft({ categoryIds: [] }))['categoryIds']).toBe(
      'Pick at least one category',
    );
  });

  it('lets a proposal have no category', () => {
    expect(validateDraft(draft({ categoryIds: [] }), { categoriesOptional: true })).toEqual({});
  });

  it('checks an optional source url', () => {
    expect(validateDraft(draft({ sourceUrl: '' }))).toEqual({});
    expect(validateDraft(draft({ sourceUrl: 'ftp://x.example' }))).toHaveProperty('sourceUrl');
  });

  it('checks the source url as it will be saved (D205)', () => {
    expect(validateDraft(draft({ sourceUrl: 'example.org' }))).toEqual({});
    expect(validateDraft(draft({ sourceUrl: 'https://' }))).toEqual({});
    expect(validateDraft(draft({ sourceUrl: 'mailto:a@b' }))['sourceUrl']).toBe(
      'Enter a valid web address',
    );
  });
});

describe('validateDraft: link', () => {
  const link = (url: string): Draft => draft({ type: 'link', payload: { url } });

  it('requires an http(s) url', () => {
    expect(validateDraft(link(''))).toHaveProperty('payload.url');
    expect(validateDraft(link('javascript:alert(1)'))).toHaveProperty('payload.url');
    expect(validateDraft(link('https://example.com/a'))).toEqual({});
  });

  it('adds https:// before checking and keeps http:// (D205)', () => {
    expect(validateDraft(link('example.com'))).toEqual({});
    expect(validateDraft(link('HTTPS://Example.com/A'))).toEqual({});
    expect(validateDraft(link('http://example.com'))).toEqual({});
    expect(validateDraft(link('hello world'))['payload.url']).toBe('Enter a valid web address');
    expect(validateDraft(link('mailto:a@b'))['payload.url']).toBe('Enter a valid web address');
  });

  it('a link left at only the scheme is required, not invalid', () => {
    expect(validateDraft(link('https://'))['payload.url']).toBe('URL is required');
  });

  it('isHttpUrl needs a parsable URL with an http(s) prefix', () => {
    expect(isHttpUrl('http://x.example')).toBe(true);
    expect(isHttpUrl('https://')).toBe(false);
    expect(isHttpUrl('mailto:a@b.c')).toBe(false);
  });
});

describe('validateDraft: image', () => {
  const image = (publicId: string, alt: string): Draft =>
    draft({ type: 'image', payload: { publicId, alt } });

  it('needs a finished upload; the description is optional (D206)', () => {
    expect(validateDraft(image('', ''))).toEqual({ 'payload.publicId': 'Add a photo' });
    expect(validateDraft(image('gobbit/items/d/p', '  '))).toEqual({});
    expect(validateDraft(image('gobbit/items/d/p', 'A loaf'))).toEqual({});
  });

  it('a valid image draft is a valid create body', () => {
    const body = toCreateBody(image('gobbit/items/d/p', 'A loaf'));
    expect(itemCreateSchema.safeParse(body).success).toBe(true);
  });

  it('an image draft without a description is a valid create body, without alt (D206)', () => {
    const body = toCreateBody(image('gobbit/items/d/p', '  '));
    expect(body.payload).toEqual({ publicId: 'gobbit/items/d/p' });
    expect(itemCreateSchema.safeParse(body).success).toBe(true);
  });
});

describe('validateDraft: table', () => {
  it('flags empty headings by column', () => {
    const errors = validateDraft(table(['A', ''], [['1', '2']]));
    expect(errors).toEqual({ 'payload.columns.1': 'Heading is required' });
  });

  it('refuses too many rows or columns and misaligned rows', () => {
    expect(
      validateDraft(
        table(
          ['A'],
          Array.from({ length: 13 }, () => ['x']),
        ),
      ),
    ).toHaveProperty('payload.rows');
    expect(validateDraft(table(['1', '2', '3', '4', '5', '6', '7'], []))).toHaveProperty(
      'payload.columns',
    );
    expect(validateDraft(table(['A', 'B'], [['1']]))).toHaveProperty('payload.rows.0');
  });

  it('refuses a payload over the byte budget', () => {
    const big = 'ש'.repeat(700); // 1400 bytes per cell
    const errors = validateDraft(
      table(
        ['A', 'B', 'C'],
        [
          [big, big, big],
          [big, big, big],
        ],
      ),
    );
    expect(errors['payload']).toMatch(/too large/);
    expect(payloadBytes(table(['A'], []))).toBe(
      JSON.stringify({ columns: ['A'], rows: [] }).length,
    );
  });
});

describe('validateDraft: calc', () => {
  it('accepts a valid calc', () => {
    const d = calc(
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B', default: '2' },
      ],
      'a * b',
    );
    expect(validateDraft(d, { calcExpression })).toEqual({});
  });

  it('checks the key pattern, uniqueness and function names', () => {
    const errors = validateDraft(
      calc(
        [
          { key: '1a', label: 'x' },
          { key: 'b', label: 'x' },
          { key: 'b', label: 'x' },
          { key: 'round', label: 'x' },
        ],
        'b',
      ),
    );
    expect(Object.keys(errors).sort()).toEqual([
      'payload.fields.0.key',
      'payload.fields.2.key',
      'payload.fields.3.key',
    ]);
  });

  it('allows at most 6 fields', () => {
    const fields = Array.from({ length: 7 }, (_, i) => ({ key: `k${i}`, label: 'x' }));
    expect(validateDraft(calc(fields, 'k0'))).toHaveProperty('payload.fields');
  });

  it('needs labels, a numeric default, an expression and a result label', () => {
    const errors = validateDraft(calc([{ key: 'a', label: '', default: 'x' }], '', ''));
    expect(errors).toMatchObject({
      'payload.fields.0.label': 'Label is required',
      'payload.fields.0.default': 'Default must be a number',
      'payload.expression': 'Expression is required',
      'payload.resultLabel': 'Result label is required',
    });
  });

  it('uses the injected expression check only when given', () => {
    const d = calc([{ key: 'a', label: 'A' }], 'a * c');
    expect(validateDraft(d)).toEqual({});
    expect(validateDraft(d, { calcExpression })).toHaveProperty('payload.expression');
  });
});

describe('errorCount', () => {
  it('counts set messages', () => {
    expect(errorCount({ a: 'x', b: undefined, c: 'y' })).toBe(2);
  });
});

/** Parity: the client mirror and the server's Zod create schema agree on these drafts. */
describe('parity with the @gobbit/shared Zod item schema', () => {
  const cases: [string, Draft][] = [
    ['text ok', draft()],
    ['blank title', draft({ title: '  ' })],
    ['121-code-point title', draft({ title: 'a'.repeat(121) })],
    ['600 emoji body', draft({ body: '😀'.repeat(600) })],
    ['601 Hebrew body', draft({ body: 'ש'.repeat(601) })],
    ['bad source url', draft({ sourceUrl: 'mailto:nope' })],
    ['bare source url', draft({ sourceUrl: 'example.org' })],
    ['link uppercase scheme', draft({ type: 'link', payload: { url: 'HTTPS://a.example/' } })],
    ['link not an address', draft({ type: 'link', payload: { url: 'hello world' } })],
    ['link ok', draft({ type: 'link', payload: { url: 'https://a.example/' } })],
    ['link no scheme', draft({ type: 'link', payload: { url: 'a.example' } })],
    ['link ftp', draft({ type: 'link', payload: { url: 'ftp://a.example' } })],
    [
      'link preview',
      draft({ type: 'link', payload: { url: 'https://a.example/', preview: { title: 'T' } } }),
    ],
    ['table ok', table(['A', 'B'], [['1', '2']])],
    ['table empty heading', table(['A', ''], [])],
    [
      'table 13 rows',
      table(
        ['A'],
        Array.from({ length: 13 }, () => ['x']),
      ),
    ],
    ['table 7 columns', table(['1', '2', '3', '4', '5', '6', '7'], [])],
    ['table no columns', table([], [])],
    [
      'table over budget',
      table(
        ['A'],
        Array.from({ length: 12 }, () => ['ש'.repeat(400)]),
      ),
    ],
    ['calc ok', calc([{ key: 'a', label: 'A', default: '1' }], 'round(a * 2)')],
    ['calc bad key', calc([{ key: '9a', label: 'A' }], '1')],
    ['calc unknown symbol', calc([{ key: 'a', label: 'A' }], 'a * c')],
    ['calc no label', calc([{ key: 'a', label: '' }], 'a')],
    ['calc no result label', calc([{ key: 'a', label: 'A' }], 'a', '')],
    [
      'calc 7 fields',
      calc(
        Array.from({ length: 7 }, (_, i) => ({ key: `k${i}`, label: 'x' })),
        'k0',
      ),
    ],
  ];

  it.each(cases)('%s', (_name, d) => {
    const client = errorCount(validateDraft(d, { calcExpression })) === 0;
    const server = itemCreateSchema.safeParse(toCreateBody(d)).success;
    expect(client).toBe(server);
  });
});
