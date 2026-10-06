import { describe, it, expect } from 'vitest';
import { shareMode } from './mode';
import type { ShareSubject } from './mode';

describe('shareMode', () => {
  it('returns private for null subject', () => {
    expect(shareMode(null)).toBe('private');
  });

  it.each([
    ['proposed', true, true, 'private'],
    ['proposed', true, false, 'private'],
    ['proposed', false, true, 'private'],
    ['proposed', false, false, 'private'],
    ['published', true, true, 'public'],
    ['published', true, false, 'private'],
    ['published', false, true, 'private'],
    ['published', false, false, 'private'],
    ['archived', true, true, 'private'],
    ['archived', true, false, 'private'],
    ['archived', false, true, 'private'],
    ['archived', false, false, 'private'],
  ] as const)(
    'status=%s, deckIsPublic=%s, hasPublicCategory=%s -> %s',
    (status, deckIsPublic, hasPublicCategory, expected) => {
      const subject: ShareSubject = {
        status,
        deletedAt: null,
        deckIsPublic,
        categoryVisibilities: hasPublicCategory ? ['public'] : ['private'],
      };
      expect(shareMode(subject)).toBe(expected);
    },
  );

  it('returns private for deleted published public item', () => {
    const subject: ShareSubject = {
      status: 'published',
      deletedAt: new Date(),
      deckIsPublic: true,
      categoryVisibilities: ['public'],
    };
    expect(shareMode(subject)).toBe('private');
  });

  it('returns private for categories with shared and private', () => {
    const subject: ShareSubject = {
      status: 'published',
      deletedAt: null,
      deckIsPublic: true,
      categoryVisibilities: ['shared', 'private'],
    };
    expect(shareMode(subject)).toBe('private');
  });

  it('returns private for empty categories', () => {
    const subject: ShareSubject = {
      status: 'published',
      deletedAt: null,
      deckIsPublic: true,
      categoryVisibilities: [],
    };
    expect(shareMode(subject)).toBe('private');
  });
});
