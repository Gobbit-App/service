import { describe, expect, it } from 'vitest';
import { itemTypes, type ItemType } from '../enums';
import { coverItemTypes, supportsCover } from './index';

const excluded: ItemType[] = ['link', 'image'];

describe('supportsCover', () => {
  it('is true for exactly the cover types', () => {
    expect(itemTypes.filter(supportsCover).sort()).toEqual([
      'calc',
      'event',
      'reminder',
      'table',
      'text',
    ]);
  });

  it('is false for link and image', () => {
    expect(supportsCover('link')).toBe(false);
    expect(supportsCover('image')).toBe(false);
  });

  it('every item type opts in or is explicitly excluded (D387)', () => {
    for (const t of itemTypes) {
      expect((coverItemTypes as readonly string[]).includes(t) || excluded.includes(t)).toBe(true);
    }
  });
});
