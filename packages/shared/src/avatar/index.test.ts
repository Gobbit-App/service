import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AVATAR_PALETTE_SIZE, avatarColorIndex, initialsFor } from './index.js';

describe('initialsFor names', () => {
  it.each([
    ['Latin', 'Dana', 'Levi', 'DL'],
    ['lower-case', 'dana', 'levi', 'DL'],
    ['Hebrew', 'דנה', 'לוי', 'דל'],
    ['Arabic', 'سارة', 'أحمد', 'سأ'],
    ['CJK', '太郎', '山田', '太山'],
    ['emoji skipped', '🙂Dana', '🎉 Levi', 'DL'],
    ['combining mark', 'élise', 'Levi', 'ÉL'],
    ['honorific', 'Dr. Dana', 'Levi', 'DL'],
    ['digit skipped', '3Dana', 'Levi', 'DL'],
    ['first only', 'Dana', '', 'D'],
    ['last only', '', 'Levi', 'L'],
  ])('%s', (_n, firstName, lastName, want) => {
    expect(initialsFor({ firstName, lastName, email: 'x@example.test' })).toBe(want);
  });
});

describe('initialsFor email', () => {
  it.each([
    ['dana.levi@example.test', 'DL'],
    ['dana@example.test', 'D'],
    ['dana.m.levi@example.test', 'DL'],
    ['dana_levi-x@example.test', 'DX'],
    ['1.2@example.test', ''],
    ['123@example.test', ''],
    ['12.dana@example.test', 'D'],
  ])('%s', (email, want) => {
    expect(initialsFor({ email })).toBe(want);
  });
  it('emoji-only names fall back to email', () => {
    expect(initialsFor({ firstName: '🙂', lastName: '🎉', email: 'dana.levi@example.test' })).toBe(
      'DL',
    );
  });
  it('nothing', () => expect(initialsFor({})).toBe(''));
});

describe('avatarColorIndex', () => {
  it('is stable and in range', () => {
    const id = randomUUID();
    expect(avatarColorIndex(id)).toBe(avatarColorIndex(id));
    for (let i = 0; i < 1000; i++) {
      const c = avatarColorIndex(randomUUID());
      expect(Number.isInteger(c) && c >= 0 && c < AVATAR_PALETTE_SIZE).toBe(true);
    }
  });
  it('spreads across the palette', () => {
    const counts = new Array<number>(AVATAR_PALETTE_SIZE).fill(0);
    // Sequential ids, not random ones: the spread is deterministic, so this can't flake.
    for (let i = 0; i < 1000; i++)
      counts[avatarColorIndex(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)]!++;
    for (const n of counts) expect(n).toBeGreaterThan(40);
  });
});
