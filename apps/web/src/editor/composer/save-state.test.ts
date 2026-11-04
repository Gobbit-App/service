import { describe, expect, it } from 'vitest';
import { saveBlockedReason, showSaveReason } from './save-state';

describe('saveBlockedReason', () => {
  it('counts fields to fix, then waits for the calculator', () => {
    expect(saveBlockedReason(1, true)).toBe('Fix 1 field');
    expect(saveBlockedReason(3, false)).toBe('Fix 3 fields');
    expect(saveBlockedReason(0, false)).toBe('Loading the calculator…');
    expect(saveBlockedReason(0, true)).toBeNull();
  });
});

describe('showSaveReason (D308)', () => {
  it('stays quiet on an untouched card until Save is tried', () => {
    expect(showSaveReason('Fix 1 field', { changed: false, attempted: false })).toBe(false);
    expect(showSaveReason('Fix 1 field', { changed: false, attempted: true })).toBe(true);
    expect(showSaveReason('Fix 1 field', { changed: true, attempted: false })).toBe(true);
    expect(showSaveReason(null, { changed: true, attempted: true })).toBe(false);
  });
});
