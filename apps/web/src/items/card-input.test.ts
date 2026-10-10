import { describe, it, expect } from 'vitest';
import { makeCategory } from '../test/fixtures';
import { buildCardInput, defaultCategoryId } from './card-input';

describe('buildCardInput', () => {
  it('builds a text card with body, empty payload and the chosen category', () => {
    expect(
      buildCardInput({
        type: 'text',
        title: 'Plumber',
        body: 'Call Sam',
        url: '',
        categoryId: 'cat-1',
      }),
    ).toEqual({
      type: 'text',
      title: 'Plumber',
      body: 'Call Sam',
      payload: {},
      categoryIds: ['cat-1'],
    });
  });

  it('builds a link card with the trimmed url and no body field', () => {
    const input = buildCardInput({
      type: 'link',
      title: 'Recipe',
      body: 'ignored',
      url: '  https://example.com/pie  ',
      categoryId: 'cat-1',
    });
    expect(input).toEqual({
      type: 'link',
      title: 'Recipe',
      payload: { url: 'https://example.com/pie' },
      categoryIds: ['cat-1'],
    });
    expect(input).not.toHaveProperty('body');
  });

  it('sends no categoryIds when no category is available', () => {
    const input = buildCardInput({ type: 'text', title: 'T', body: '', url: '', categoryId: null });
    expect(input).toMatchObject({ categoryIds: [] });
  });
});

describe('defaultCategoryId', () => {
  it('returns the category flagged as default', () => {
    const categories = [
      makeCategory({ id: 'a', isDefault: false }),
      makeCategory({ id: 'b', isDefault: true }),
    ];
    expect(defaultCategoryId(categories)).toBe('b');
  });

  it('returns null when no category is default or the list is empty', () => {
    expect(defaultCategoryId([makeCategory({ id: 'a', isDefault: false })])).toBeNull();
    expect(defaultCategoryId([])).toBeNull();
  });
});
