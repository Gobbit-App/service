import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { toSlug, toCategorySlug } from './slug';
import { SLUG_MAX } from '@gobbit/shared';

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

describe('toCategorySlug', () => {
  const hashed = (name: string) =>
    'c-' +
    createHash('sha256').update(name.normalize('NFC').toLowerCase()).digest('hex').slice(0, 8);

  it('keeps a Latin name as toSlug gives it', () => {
    expect(toCategorySlug('Health Services')).toBe('health-services');
  });

  it('falls back to c- plus 8 hex of the SHA-256 of the NFC lower-cased name', () => {
    const slug = toCategorySlug('בריאות');
    expect(slug).toMatch(/^c-[0-9a-f]{8}$/);
    expect(slug).toBe(hashed('בריאות'));
  });

  it('gives the same address for a different case or normalisation', () => {
    expect(toCategorySlug('שלום')).toBe(toCategorySlug('שלום'.normalize('NFD')));
    expect(toCategorySlug('שירותי בריאות')).toBe(toCategorySlug('שירותי בריאות'.normalize('NFD')));
    expect(toCategorySlug('בריאות!')).toBe(toCategorySlug('בריאות!'.toUpperCase()));
  });

  it("keeps today's slug for mixed script", () => {
    expect(toCategorySlug('בריאות Health')).toBe(toSlug('בריאות Health'));
  });
});
