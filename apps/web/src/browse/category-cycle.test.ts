import { describe, expect, it } from 'vitest';
import { makeCategory } from '../test/fixtures';
import { categoryCycle, resolveCategory, stepCategory } from './category-cycle';

const categories = [
  makeCategory({ id: 'c3', slug: 'school', name: 'School', isDefault: false, position: 2 }),
  makeCategory({ id: 'c1', slug: 'general', name: 'General', isDefault: true, position: 0 }),
  makeCategory({ id: 'c2', slug: 'food', name: 'Food', isDefault: false, position: 1 }),
];

describe('categoryCycle', () => {
  it('puts All first, then the chip-row order', () => {
    expect(categoryCycle(categories).map((e) => e.slug)).toEqual([
      'all',
      'general',
      'food',
      'school',
    ]);
    expect(categoryCycle(categories)[0]).toEqual({ slug: 'all', name: 'All' });
  });

  it('holds only All and categories (no Favorites or Archived)', () => {
    const names = categoryCycle(categories).map((e) => e.name);
    expect(names).not.toContain('Favorites');
    expect(names).not.toContain('Archived');
    expect(categoryCycle([])).toEqual([{ slug: 'all', name: 'All' }]);
  });

  it('never lists a category whose slug collides with All', () => {
    const odd = makeCategory({ id: 'c9', slug: 'all', name: 'All the things', isDefault: false });
    expect(categoryCycle([odd]).map((e) => e.name)).toEqual(['All']);
  });
});

describe('stepCategory', () => {
  const cycle = categoryCycle(categories);

  it('moves to the next and previous entry', () => {
    expect(stepCategory(cycle, 'all', 'next')?.slug).toBe('general');
    expect(stepCategory(cycle, 'food', 'next')?.slug).toBe('school');
    expect(stepCategory(cycle, 'food', 'prev')?.slug).toBe('general');
    expect(stepCategory(cycle, 'general', 'prev')?.slug).toBe('all');
  });

  it('does not wrap at either end', () => {
    expect(stepCategory(cycle, 'all', 'prev')).toBeNull();
    expect(stepCategory(cycle, 'school', 'next')).toBeNull();
  });

  it('treats an unknown slug as All', () => {
    expect(resolveCategory(cycle, 'gone')).toBe('all');
    expect(resolveCategory(cycle, 'food')).toBe('food');
    expect(stepCategory(cycle, 'gone', 'next')?.slug).toBe('general');
    expect(stepCategory(cycle, 'gone', 'prev')).toBeNull();
  });
});
