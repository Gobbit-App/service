import { describe, expect, it } from 'vitest';
import { ITEM_EVENT_TITLE_MAX } from '@pb/shared';
import type { Actor } from '../types';
import { eventFrom, toEventRow } from './item-event';

const actor = { user: { id: 'u1' }, via: 'session' } as Actor;
const item = { id: 'i1', deckId: 'd1', title: 'Plumber' };

describe('item events (D187)', () => {
  it('eventFrom takes the actor and via from the acting principal', () => {
    expect(eventFrom(actor, 'archived')).toEqual({
      kind: 'archived',
      via: 'session',
      actorUserId: 'u1',
      changes: undefined,
    });
  });

  it('keeps changes only for updated and merged', () => {
    expect(toEventRow(item, eventFrom(actor, 'updated', ['title'])).changes).toEqual(['title']);
    expect(toEventRow(item, eventFrom(actor, 'merged', ['body'])).changes).toEqual(['body']);
    expect(toEventRow(item, eventFrom(actor, 'published', ['title'])).changes).toBeNull();
    expect(toEventRow(item, eventFrom(actor, 'updated', [])).changes).toBeNull();
  });

  it('copies the card and truncates the title by code points', () => {
    const long = '🔧'.repeat(ITEM_EVENT_TITLE_MAX + 5);
    const row = toEventRow({ ...item, title: long }, eventFrom(actor, 'created'));
    expect(row).toMatchObject({ deckId: 'd1', itemId: 'i1', kind: 'created', via: 'session' });
    expect(Array.from(row.title)).toHaveLength(ITEM_EVENT_TITLE_MAX);
  });
});
