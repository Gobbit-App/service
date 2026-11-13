import { describe, expect, it } from 'vitest';
import { eventSummary, eventWhenLine } from './event-summary';

const NOW = new Date('2030-01-01T00:00:00Z');

describe('eventWhenLine (D367)', () => {
  it('a timed event in its own zone, with the zone named', () => {
    const line = eventWhenLine(
      {
        allDay: false,
        start: '2030-12-05T18:00:00+02:00',
        end: '2030-12-05T20:00:00+02:00',
        timeZone: 'Asia/Jerusalem',
      },
      NOW,
    );
    expect(line).toContain('18:00');
    expect(line).toContain('20:00');
    expect(line).toContain('(Asia/Jerusalem)');
  });

  it('an all-day event has no clock time or zone', () => {
    const line = eventWhenLine(
      { allDay: true, start: '2030-12-05', end: '2030-12-07', timeZone: 'Europe/London' },
      NOW,
    );
    expect(line).not.toMatch(/\d\d:\d\d/);
    expect(line).not.toContain('Europe/London');
  });

  it('null for an unreadable payload', () => {
    expect(eventWhenLine({ allDay: false, start: 'nope', timeZone: 'UTC' })).toBeNull();
  });
});

describe('eventSummary (042 share description)', () => {
  const payload = {
    allDay: false,
    start: '2030-12-05T18:00:00Z',
    timeZone: 'UTC',
    location: ' Town Hall ',
    notify: { before: [], audience: { mode: 'people', userIds: ['secret-user'] } },
  };

  it('"date · location", never the audience', () => {
    const out = eventSummary({ type: 'event', payload }, NOW);
    expect(out).toMatch(/ · Town Hall$/);
    expect(out).not.toContain('secret-user');
  });

  it('just the date without a location', () => {
    const out = eventSummary({ type: 'event', payload: { ...payload, location: undefined } }, NOW);
    expect(out).not.toContain('·');
  });

  it('null for other types', () => {
    expect(eventSummary({ type: 'text', payload: {} })).toBeNull();
  });
});
