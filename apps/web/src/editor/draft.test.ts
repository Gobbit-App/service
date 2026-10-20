import { describe, expect, it } from 'vitest';
import { makeItem } from '../test/fixtures';
import {
  draftFromItem,
  emptyDraft,
  isCreatableType,
  isDirty,
  parseCalcDefault,
  toCreateBody,
  toPatch,
  withType,
  type CalcDraftPayload,
  type Draft,
  type LinkDraftPayload,
} from './draft';

const calcItem = makeItem({
  type: 'calc',
  payload: {
    fields: [
      { key: 'a', label: 'A', default: 2 },
      { key: 'b', label: 'B', unit: 'kg' },
    ],
    expression: 'a * b',
    resultLabel: 'Total',
  },
});

describe('emptyDraft', () => {
  it('preselects the default category and starts empty', () => {
    expect(emptyDraft('text', 'c1')).toEqual({
      type: 'text',
      title: '',
      body: '',
      payload: {},
      categoryIds: ['c1'],
      sourceUrl: '',
      entities: null,
    });
  });

  it('starts with no category when the deck has no default', () => {
    expect(emptyDraft('link', null).categoryIds).toEqual([]);
  });

  it('gives each type an editable empty payload', () => {
    expect(emptyDraft('link', null).payload).toEqual({ url: '' });
    expect(emptyDraft('table', null).payload).toEqual({ columns: ['', ''], rows: [['', '']] });
    expect((emptyDraft('calc', null).payload as CalcDraftPayload).fields).toHaveLength(1);
  });
});

describe('withType', () => {
  it('resets the payload and keeps title, body and categories', () => {
    const draft = { ...emptyDraft('link', 'c1'), title: 'T', body: 'B' };
    const next = withType({ ...draft, payload: { url: 'https://a.example/' } }, 'table');
    expect(next.type).toBe('table');
    expect(next.payload).toEqual({ columns: ['', ''], rows: [['', '']] });
    expect(next).toMatchObject({ title: 'T', body: 'B', categoryIds: ['c1'] });
  });

  it('returns the same draft for the same type', () => {
    const draft = emptyDraft('text', null);
    expect(withType(draft, 'text')).toBe(draft);
  });
});

describe('isCreatableType', () => {
  it('accepts the five card types only', () => {
    expect(['text', 'link', 'image', 'table', 'calc'].every(isCreatableType)).toBe(true);
    expect(isCreatableType('video')).toBe(false);
    expect(isCreatableType(undefined)).toBe(false);
  });
});

describe('draftFromItem', () => {
  it('maps a link item to its editable draft', () => {
    const item = makeItem({
      type: 'link',
      payload: { url: 'https://a.example/' },
      categoryIds: ['c1'],
    });
    expect(draftFromItem(item)).toEqual({
      type: 'link',
      title: item.title,
      body: item.body,
      payload: { url: 'https://a.example/' },
      categoryIds: ['c1'],
      sourceUrl: '',
      entities: {},
    });
  });

  it('copies categoryIds and payload instead of sharing them', () => {
    const item = makeItem({
      type: 'link',
      payload: { url: 'https://a.example/' },
      categoryIds: ['c1'],
    });
    const draft = draftFromItem(item);
    expect(draft.categoryIds).not.toBe(item.categoryIds);
    expect(draft.payload).not.toBe(item.payload);
  });

  it('gives an empty payload for a text item', () => {
    expect(draftFromItem(makeItem({ type: 'text', payload: {} })).payload).toEqual({});
  });

  it('pads short table rows to the column count', () => {
    const item = makeItem({
      type: 'table',
      payload: { columns: ['A', 'B', 'C'], rows: [['1'], ['1', '2', '3']] },
    });
    expect(draftFromItem(item).payload).toEqual({
      columns: ['A', 'B', 'C'],
      rows: [
        ['1', '', ''],
        ['1', '2', '3'],
      ],
    });
  });

  it('turns calc unit and default into text inputs', () => {
    expect((draftFromItem(calcItem).payload as CalcDraftPayload).fields).toEqual([
      { key: 'a', label: 'A', unit: '', default: '2' },
      { key: 'b', label: 'B', unit: 'kg', default: '' },
    ]);
  });

  it('keeps the source url', () => {
    expect(draftFromItem(makeItem({ sourceUrl: 'https://s.example/' })).sourceUrl).toBe(
      'https://s.example/',
    );
  });
});

describe('toCreateBody', () => {
  it('builds the POST body without status and omits an empty source url', () => {
    const draft: Draft = { ...emptyDraft('text', 'c1'), title: '  Hi ', body: 'Body' };
    expect(toCreateBody(draft)).toEqual({
      type: 'text',
      title: 'Hi',
      body: 'Body',
      payload: {},
      categoryIds: ['c1'],
    });
  });

  it('trims the link url, drops empty preview keys and keeps the source url', () => {
    const draft: Draft = {
      ...emptyDraft('link', 'c1'),
      title: 'L',
      payload: { url: ' https://a.example/ ', preview: { title: 'T', description: '' } },
      sourceUrl: 'https://s.example/',
    };
    expect(toCreateBody(draft)).toMatchObject({
      payload: { url: 'https://a.example/', preview: { title: 'T' } },
      sourceUrl: 'https://s.example/',
    });
  });

  it('converts calc defaults to numbers and drops empty units', () => {
    const draft: Draft = {
      ...emptyDraft('calc', 'c1'),
      title: 'C',
      payload: {
        fields: [{ key: 'a', label: 'A', unit: '', default: '1.5' }],
        expression: ' a * 2 ',
        resultLabel: 'R',
      },
    };
    expect(toCreateBody(draft).payload).toEqual({
      fields: [{ key: 'a', label: 'A', default: 1.5 }],
      expression: 'a * 2',
      resultLabel: 'R',
    });
  });
});

describe('parseCalcDefault', () => {
  it('maps empty to undefined and text to a number', () => {
    expect(parseCalcDefault(' ')).toBeUndefined();
    expect(parseCalcDefault('3')).toBe(3);
    expect(parseCalcDefault('x')).toBeNaN();
  });
});

describe('toPatch', () => {
  it('returns null when the draft is unchanged', () => {
    const item = makeItem({ type: 'text' });
    expect(toPatch(item, draftFromItem(item))).toBeNull();
  });

  it('returns null for an unchanged calc and table (normalisation is not a change)', () => {
    expect(toPatch(calcItem, draftFromItem(calcItem))).toBeNull();
    const table = makeItem({ type: 'table', payload: { columns: ['A'], rows: [['1']] } });
    expect(toPatch(table, draftFromItem(table))).toBeNull();
  });

  it('ignores jsonb key order in the stored payload', () => {
    const item = makeItem({
      type: 'link',
      payload: { preview: { description: 'D', title: 'T' }, url: 'https://a.example/' },
    });
    expect(toPatch(item, draftFromItem(item))).toBeNull();
  });

  it('returns only the title when only the title changed', () => {
    const item = makeItem({ type: 'text' });
    expect(toPatch(item, { ...draftFromItem(item), title: 'New' })).toEqual({ title: 'New' });
  });

  it('ignores surrounding whitespace in the title', () => {
    const item = makeItem({ type: 'text', title: 'Same' });
    expect(toPatch(item, { ...draftFromItem(item), title: ' Same ' })).toBeNull();
  });

  it('returns only the body when only the body changed', () => {
    const item = makeItem({ type: 'text' });
    expect(toPatch(item, { ...draftFromItem(item), body: 'Changed' })).toEqual({ body: 'Changed' });
  });

  it('returns null when categories are reordered only', () => {
    const item = makeItem({ type: 'text', categoryIds: ['c1', 'c2'] });
    expect(toPatch(item, { ...draftFromItem(item), categoryIds: ['c2', 'c1'] })).toBeNull();
  });

  it('returns the full categoryIds when a category is added', () => {
    const item = makeItem({ type: 'text', categoryIds: ['c1'] });
    expect(toPatch(item, { ...draftFromItem(item), categoryIds: ['c1', 'c2'] })).toEqual({
      categoryIds: ['c1', 'c2'],
    });
  });

  it('trims a changed link url and patches the payload', () => {
    const item = makeItem({ type: 'link', payload: { url: 'https://a.example/' } });
    const draft = { ...draftFromItem(item), payload: { url: ' https://b.example/ ' } };
    expect(toPatch(item, draft)).toEqual({ payload: { url: 'https://b.example/' } });
  });

  it('keeps other payload keys when the link url changes', () => {
    const item = makeItem({
      type: 'link',
      payload: { url: 'https://a.example/', preview: { image: 'https://i.example/x.png' } },
    });
    const draft = draftFromItem(item);
    const payload = { ...(draft.payload as LinkDraftPayload), url: 'https://b.example/' };
    expect(toPatch(item, { ...draft, payload })).toEqual({
      payload: { url: 'https://b.example/', preview: { image: 'https://i.example/x.png' } },
    });
  });

  it('sends the whole payload when one table cell changes', () => {
    const item = makeItem({
      type: 'table',
      payload: { columns: ['A', 'B'], rows: [['1', '2']] },
    });
    const draft = { ...draftFromItem(item), payload: { columns: ['A', 'B'], rows: [['1', '3']] } };
    expect(toPatch(item, draft)).toEqual({ payload: { columns: ['A', 'B'], rows: [['1', '3']] } });
  });

  it('never sends a payload for a text item', () => {
    const item = makeItem({ type: 'text', payload: {} });
    const draft = { ...draftFromItem(item), payload: { url: 'https://x.example/' } } as Draft;
    expect(toPatch(item, draft)).toBeNull();
  });

  it('sends sourceUrl: null when the source url is cleared', () => {
    const item = makeItem({ sourceUrl: 'https://s.example/' });
    expect(toPatch(item, { ...draftFromItem(item), sourceUrl: ' ' })).toEqual({ sourceUrl: null });
  });

  it('sends a new source url', () => {
    const item = makeItem();
    expect(toPatch(item, { ...draftFromItem(item), sourceUrl: 'https://s.example/' })).toEqual({
      sourceUrl: 'https://s.example/',
    });
  });

  it('sends the whole entities after a removal, compacted', () => {
    const item = makeItem({ entities: { phones: ['555'], urls: ['u.example'] } });
    const draft = { ...draftFromItem(item), entities: { phones: [], urls: ['u.example'] } };
    expect(toPatch(item, draft)).toEqual({ entities: { urls: ['u.example'] } });
  });

  it('never includes type or status', () => {
    const item = makeItem({ type: 'text', status: 'proposed' });
    const patch = toPatch(item, { ...draftFromItem(item), type: 'link', title: 'X' });
    expect(patch).toEqual({ title: 'X' });
    expect(patch).not.toHaveProperty('status');
  });
});

describe('isDirty', () => {
  it('compares structurally', () => {
    const base = emptyDraft('text', 'c1');
    expect(isDirty({ ...base, categoryIds: ['c1'] }, base)).toBe(false);
    expect(isDirty({ ...base, title: 'x' }, base)).toBe(true);
  });
});
