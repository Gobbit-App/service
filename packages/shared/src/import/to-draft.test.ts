import { describe, expect, it } from 'vitest';
import type { ImportRow } from './constants';
import { toImportDraft } from './to-draft';

describe('toImportDraft section rows', () => {
  it('passes title and a multi-paragraph body through verbatim', () => {
    const body = 'פסקה ראשונה עם **הדגשה**\n\n\n- פריט אחד\n- פריט שני\n\n  פסקה   אחרונה  \n';
    const row = {
      line: 3,
      type: 'text',
      title: 'בריאות',
      body,
      sourceUrl: null,
      categories: [],
      cover: null,
      image: null,
    } as unknown as ImportRow;
    const draft = toImportDraft(row, []);
    expect(draft.title).toBe('בריאות');
    expect(draft.body).toBe(body);
  });
});
