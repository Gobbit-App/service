import { describe, expect, it } from 'vitest';
import type { StructuredEvent } from '@gobbit/shared';
import { proposeEvent, type EventContext } from './extract-event';
import type { ProposeCardInput } from './extract-prompt';

const now = new Date('2026-11-01T12:00:00.000Z');

function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    severalEvents: false,
    timeZone: 'Europe/London',
    zoneSource: 'request',
    personalDeck: false,
    startMaxDays: 730,
    locationMax: 200,
    now,
    ...overrides,
  };
}

function input(event: ProposeCardInput['event']): ProposeCardInput {
  return {
    type: 'event',
    title: 'Winter fair',
    body: 'Stalls',
    event,
    categoryIds: [],
    language: 'en',
    confidence: 0.9,
  };
}

const structured: StructuredEvent = {
  name: 'Winter fair',
  startDate: '2026-12-03T18:00:00+01:00',
  endDate: '2026-12-03T21:00:00+01:00',
  location: 'Town hall',
  url: 'https://fair.example/events/winter-fair',
};

describe('proposeEvent (D370)', () => {
  it('takes the dates, place and link from structured data over the model', () => {
    const r = proposeEvent(
      input({ start: '2026-12-04T10:00', allDay: false, location: 'Somewhere else' }),
      ctx({ structured }),
      { url: 'https://fair.example/whats-on' },
    );
    expect(r).toMatchObject({
      ok: true,
      decision: { outcome: 'event_proposed', dateSource: 'structured', zoneSource: 'request' },
    });
    if (!r.ok) throw new Error('expected an event');
    expect(r.payload).toMatchObject({
      allDay: false,
      start: '2026-12-03T17:00:00.000Z',
      end: '2026-12-03T20:00:00.000Z',
      timeZone: 'Europe/London',
      location: 'Town hall',
      url: 'https://fair.example/events/winter-fair',
    });
    expect(r.payload).not.toHaveProperty('preview');
  });

  it("reads the model's local time in the share's zone and keeps the page preview", () => {
    const preview = { title: 'Winter fair' };
    const r = proposeEvent(
      input({ start: '2026-12-03T18:00', allDay: false }),
      ctx({ timeZone: 'America/New_York', zoneSource: 'fallback' }),
      { url: 'https://fair.example/', preview },
    );
    expect(r).toMatchObject({
      ok: true,
      decision: { dateSource: 'model', zoneSource: 'fallback' },
      payload: {
        start: '2026-12-03T23:00:00.000Z',
        timeZone: 'America/New_York',
        url: 'https://fair.example/',
        preview,
      },
    });
  });

  it('keeps only the date of an all-day start the model gave a time to', () => {
    const r = proposeEvent(input({ start: '2026-12-21T09:00', allDay: true }), ctx(), {});
    expect(r).toMatchObject({ ok: true, payload: { allDay: true, start: '2026-12-21' } });
  });

  it('notifies with the defaults, and only "me" on a personal deck (D362)', () => {
    const shared = proposeEvent(input({ start: '2026-12-21', allDay: true }), ctx(), {});
    const mine = proposeEvent(
      input({ start: '2026-12-21', allDay: true }),
      ctx({ personalDeck: true }),
      {},
    );
    if (!shared.ok || !mine.ok) throw new Error('expected events');
    expect((shared.payload.notify as { audience: { mode: string } }).audience.mode).not.toBe('me');
    expect(mine.payload.notify).toMatchObject({ audience: { mode: 'me', userIds: [] } });
  });

  it('clips a long location to the limit', () => {
    const r = proposeEvent(
      input({ start: '2026-12-21', allDay: true, location: `  ${'x'.repeat(30)}  ` }),
      ctx({ locationMax: 10 }),
      {},
    );
    expect(r).toMatchObject({ ok: true, payload: { location: 'x'.repeat(10) } });
  });

  it.each([
    ['no_start', input({ allDay: false }), ctx()],
    ['no_start', input(null), ctx()],
    ['several_events', input({ start: '2026-12-21', allDay: true }), ctx({ severalEvents: true })],
    ['invalid_zone', input({ start: '2026-12-21', allDay: true }), ctx({ timeZone: 'Mars/Base' })],
    [
      'end_before_start',
      input({ start: '2026-12-21T18:00', end: '2026-12-21T17:00', allDay: false }),
      ctx(),
    ],
    ['start_out_of_range', input({ start: '2026-12-21', allDay: true }), ctx({ startMaxDays: 7 })],
  ] as const)('falls back with %s, never inventing a date', (reason, given, context) => {
    expect(proposeEvent(given, context, {})).toEqual({
      ok: false,
      decision: { outcome: 'event_fallback', reason },
    });
  });
});
