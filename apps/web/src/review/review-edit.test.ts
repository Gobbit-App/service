import { describe, expect, it } from 'vitest';
import { makeItem } from '../test/fixtures';
import { buildReviewPatch, draftFromItem } from './review-edit';

describe('draftFromItem', () => {
  it('maps a link item to its editable draft', () => {
    const item = makeItem({
      type: 'link',
      payload: { url: 'https://a.example/' },
      categoryIds: ['c1'],
    });
    expect(draftFromItem(item)).toEqual({
      title: item.title,
      body: item.body,
      url: 'https://a.example/',
      categoryIds: ['c1'],
    });
  });

  it('copies categoryIds instead of sharing the array', () => {
    const item = makeItem({
      type: 'link',
      payload: { url: 'https://a.example/' },
      categoryIds: ['c1'],
    });
    const draft = draftFromItem(item);
    expect(draft.categoryIds).not.toBe(item.categoryIds);
  });

  it('gives an empty url for a text item with an empty payload', () => {
    const item = makeItem({ type: 'text', payload: {} });
    expect(draftFromItem(item).url).toBe('');
  });
});

describe('buildReviewPatch', () => {
  it('returns null when the draft is unchanged', () => {
    const item = makeItem({ type: 'text' });
    expect(buildReviewPatch(item, draftFromItem(item))).toBeNull();
  });

  it('returns only the title when only the title changed', () => {
    const item = makeItem({ type: 'text' });
    const draft = { ...draftFromItem(item), title: 'New' };
    expect(buildReviewPatch(item, draft)).toEqual({ title: 'New' });
  });

  it('returns only the body when only the body changed', () => {
    const item = makeItem({ type: 'text' });
    const draft = { ...draftFromItem(item), body: 'Changed' };
    expect(buildReviewPatch(item, draft)).toEqual({ body: 'Changed' });
  });

  it('returns null when categories are reordered only', () => {
    const item = makeItem({ type: 'text', categoryIds: ['c1', 'c2'] });
    const draft = { ...draftFromItem(item), categoryIds: ['c2', 'c1'] };
    expect(buildReviewPatch(item, draft)).toBeNull();
  });

  it('returns the full categoryIds when a category is added', () => {
    const item = makeItem({ type: 'text', categoryIds: ['c1'] });
    const draft = { ...draftFromItem(item), categoryIds: ['c1', 'c2'] };
    expect(buildReviewPatch(item, draft)).toEqual({ categoryIds: ['c1', 'c2'] });
  });

  it('trims a changed link url and patches the payload', () => {
    const item = makeItem({ type: 'link', payload: { url: 'https://a.example/' } });
    const draft = { ...draftFromItem(item), url: ' https://b.example/ ' };
    expect(buildReviewPatch(item, draft)).toEqual({
      payload: { url: 'https://b.example/' },
    });
  });

  it('keeps other payload keys when the link url changes', () => {
    const item = makeItem({
      type: 'link',
      payload: { url: 'https://a.example/', note: 'x' },
    });
    const draft = { ...draftFromItem(item), url: 'https://b.example/' };
    expect(buildReviewPatch(item, draft)).toEqual({
      payload: { url: 'https://b.example/', note: 'x' },
    });
  });

  it('ignores a url in the draft for a text item', () => {
    const item = makeItem({ type: 'text', payload: {} });
    const draft = { ...draftFromItem(item), url: 'https://x.example/' };
    expect(buildReviewPatch(item, draft)).toBeNull();
  });
});
