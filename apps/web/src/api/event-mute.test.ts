import { describe, expect, it } from 'vitest';
import type { Item } from '@gobbit/shared';
import { makeItem } from '../test/fixtures';
import { canMuteEvent, withMute } from './event-mute';

const state: NonNullable<Item['event']> = {
  startsAt: '2026-12-03T16:00:00.000Z',
  endsAt: '2026-12-03T18:00:00.000Z',
  allDay: false,
  timeZone: 'UTC',
  notices: [],
  muted: false,
  inAudience: true,
  canEditNotify: false,
};
const event = makeItem({ type: 'event', event: state });

describe('event mute (D364)', () => {
  it('applies to live events in the caller audience only', () => {
    expect(canMuteEvent(event)).toBe(true);
    expect(canMuteEvent({ ...event, event: { ...state, inAudience: false } })).toBe(false);
    expect(canMuteEvent({ ...event, status: 'archived' })).toBe(false);
    expect(canMuteEvent({ ...event, status: 'proposed' })).toBe(false);
    expect(canMuteEvent({ ...event, deletedAt: '2026-01-02T00:00:00.000Z' })).toBe(false);
    expect(canMuteEvent(makeItem())).toBe(false);
  });

  it('sets the caller mute on the cached card', () => {
    expect(withMute(event, true).event?.muted).toBe(true);
    const plain = makeItem();
    expect(withMute(plain, true)).toBe(plain);
  });
});
