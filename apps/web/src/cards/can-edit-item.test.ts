import { describe, expect, it } from 'vitest';
import { canEditItem, editHref } from './can-edit-item';

const published = { status: 'published' as const, createdBy: 'u1', deletedAt: undefined };
const proposal = { ...published, status: 'proposed' as const };

describe('canEditItem (R8)', () => {
  it('readers and unknown roles never edit', () => {
    expect(canEditItem(published, 'reader', 'u1')).toBe(false);
    expect(canEditItem(published, undefined, 'u1')).toBe(false);
  });

  it('editors and above edit published and archived cards', () => {
    for (const role of ['editor', 'maintainer', 'owner'] as const) {
      expect(canEditItem(published, role, 'other')).toBe(true);
      expect(canEditItem({ ...published, status: 'archived' }, role, 'other')).toBe(true);
    }
  });

  it('a proposal: its creator or a publisher only', () => {
    expect(canEditItem(proposal, 'editor', 'u1')).toBe(true);
    expect(canEditItem(proposal, 'editor', 'u2')).toBe(false);
    expect(canEditItem(proposal, 'editor', undefined)).toBe(false);
    expect(canEditItem(proposal, 'maintainer', 'u2')).toBe(true);
    expect(canEditItem(proposal, 'owner', undefined)).toBe(true);
  });

  it('a deleted card is not editable', () => {
    const deleted = { ...published, deletedAt: '2026-01-01T00:00:00.000Z' };
    expect(canEditItem(deleted, 'owner', 'u1')).toBe(false);
  });
});

describe('editHref', () => {
  it('builds the edit route, optionally back to review', () => {
    expect(editHref('i1')).toBe('/i/i1/edit');
    expect(editHref('i1', 'review')).toBe('/i/i1/edit?from=review');
  });
});
