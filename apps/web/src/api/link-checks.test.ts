import { describe, expect, it } from 'vitest';
import { makeItem } from '../test/fixtures';
import { belongsTo } from './item-lifecycle';
import { linkCheckActions, withoutFlag } from './link-checks';
import { itemListQuery } from './query-keys';

const health = { status: 'changed' as const, checkedAt: '2026-10-20T06:30:00.000Z' };
const flagged = makeItem({ type: 'link', payload: { url: 'https://e.com' }, linkHealth: health });

describe('linkCheckActions (D165)', () => {
  it('gives item.update roles both actions on a flagged, live link card', () => {
    expect(linkCheckActions(flagged, 'editor')).toEqual(['check', 'dismiss']);
    expect(linkCheckActions(flagged, 'owner')).toEqual(['check', 'dismiss']);
  });

  it('gives nothing to readers, healthy links, archived or deleted cards', () => {
    expect(linkCheckActions(flagged, 'reader')).toEqual([]);
    expect(linkCheckActions({ ...flagged, linkHealth: null }, 'owner')).toEqual([]);
    expect(linkCheckActions({ ...flagged, status: 'archived' }, 'owner')).toEqual([]);
    expect(
      linkCheckActions({ ...flagged, deletedAt: '2026-10-21T00:00:00.000Z' }, 'owner'),
    ).toEqual([]);
  });

  it('withoutFlag clears only the flag', () => {
    expect(withoutFlag(flagged)).toEqual({ ...flagged, linkHealth: null });
  });
});

describe('the links list filter', () => {
  it('asks the API for flag=link', () => {
    expect(itemListQuery({ kind: 'links' }, null)).toEqual({ limit: 20, flag: 'link' });
  });

  it('drops cards whose flag is gone and leaves flagged ones to the refetch', () => {
    expect(belongsTo({ kind: 'links' }, { ...flagged, linkHealth: null })).toBe(false);
    expect(belongsTo({ kind: 'links' }, { ...flagged, status: 'archived' })).toBe(false);
    expect(belongsTo({ kind: 'links' }, flagged)).toBeNull();
  });
});
