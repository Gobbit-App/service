import { describe, expect, it } from 'vitest';
import { CARD_BODY_MAX, importDraftSchema, type ImportDraftInput } from '@pb/shared';
import { assertImportRows, importRowDraft } from './import-rows';

const row = (input: ImportDraftInput) => importDraftSchema.parse(input);

describe('importRowDraft (D190)', () => {
  it('maps a text row to a text draft with its suggested category', () => {
    expect(importRowDraft(row({ type: 'text', title: 'Clinic', newCategory: 'Health' }))).toEqual({
      type: 'text',
      title: 'Clinic',
      body: '',
      payload: {},
      newCategory: 'Health',
    });
  });

  it('uses a link row sourceUrl as its payload URL', () => {
    expect(
      importRowDraft(
        row({
          type: 'link',
          title: 'Forms',
          sourceUrl: 'https://example.org/forms',
          categoryIds: ['5f2b8a4e-1c0d-4d8e-9a6b-2f1e3c4d5a6b'],
        }),
      ),
    ).toEqual({
      type: 'link',
      title: 'Forms',
      body: '',
      payload: { url: 'https://example.org/forms' },
      sourceUrl: 'https://example.org/forms',
      categoryIds: ['5f2b8a4e-1c0d-4d8e-9a6b-2f1e3c4d5a6b'],
    });
  });
});

describe('assertImportRows (D190)', () => {
  it('returns one draft per valid row', () => {
    const drafts = assertImportRows([
      row({ type: 'text', title: 'One' }),
      row({ type: 'text', title: 'Two', body: 'Body' }),
    ]);
    expect(drafts.map((d) => d.title)).toEqual(['One', 'Two']);
  });

  it('refuses the request naming the first bad row', () => {
    const tooLong = { type: 'text', title: 'Long', body: 'x'.repeat(CARD_BODY_MAX + 1) } as const;
    expect(() => assertImportRows([row({ type: 'text', title: 'Ok' }), tooLong])).toThrow(
      expect.objectContaining({ status: 400, detail: expect.stringMatching(/^Row 1: /) }),
    );
  });
});
