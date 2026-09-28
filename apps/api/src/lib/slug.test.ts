import { describe, it, expect } from 'vitest';
import { toSlug } from './slug';
import { SLUG_MAX } from '@pb/shared';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('toSlug', () => {
  it('converts "My Family Book" to "my-family-book"', () => {
    expect(toSlug('My Family Book')).toBe('my-family-book');
  });

  it('transliterates Greek "Ελληνικά Νέα" to non-empty valid slug', () => {
    const slug = toSlug('Ελληνικά Νέα');
    expect(slug).not.toBe('');
    expect(slug).toMatch(SLUG_REGEX);
  });

  it('handles Hebrew "שלום" returning empty string or valid slug', () => {
    const slug = toSlug('שלום');
    expect(slug === '' || SLUG_REGEX.test(slug)).toBe(true);
  });

  it('truncates 70-char name to SLUG_MAX length without trailing dash', () => {
    const longName = 'a'.repeat(70);
    const slug = toSlug(longName);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(slug).not.toMatch(/-$/);
  });
});
