import { describe, expect, it } from 'vitest';
import { makeItem } from '../test/fixtures';
import { availableActions } from './use-card-lifecycle';

const published = makeItem({ id: 'i1' });
const archived = makeItem({ id: 'i1', status: 'archived' });
const deleted = makeItem({ id: 'i1', deletedAt: '2026-01-02T00:00:00.000Z' });
const proposal = makeItem({ id: 'i1', status: 'proposed' });

describe('availableActions (FR-014)', () => {
  it('gives editors archive/restore only, owners and maintainers delete too', () => {
    expect(availableActions(published, 'editor')).toEqual(['archive']);
    expect(availableActions(archived, 'editor')).toEqual(['restore']);
    expect(availableActions(published, 'maintainer')).toEqual(['archive', 'delete']);
    expect(availableActions(archived, 'owner')).toEqual(['restore', 'delete']);
  });

  it('gives readers nothing, proposals nothing, deleted cards undelete for item.delete', () => {
    expect(availableActions(published, 'reader')).toEqual([]);
    expect(availableActions(proposal, 'owner')).toEqual([]);
    expect(availableActions(deleted, 'owner')).toEqual(['undelete']);
    expect(availableActions(deleted, 'editor')).toEqual([]);
  });
});
