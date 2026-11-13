import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVENT_LOCATION_MAX } from '@gobbit/shared/event-constants';
import { extractPage } from './extract-page';
import { structuredEvents } from './structured-event';

const dir = new URL('./__fixtures__/event-pages/', import.meta.url);
const PAGE_URL = 'https://fair.example/whats-on';
const page = (file: string) => extractPage(readFileSync(new URL(file, dir), 'utf8'), PAGE_URL);

describe('structured events (D370)', () => {
  it('reads one Event object with its place and address', () => {
    const p = page('object.html');
    expect(p.structuredEventCount).toBe(1);
    expect(p.structuredEvent).toEqual({
      name: 'Winter fair',
      startDate: '2026-12-03T18:00:00+01:00',
      endDate: '2026-12-03T21:00:00+01:00',
      location: 'Town hall, 1 High Street, Springfield',
      url: 'https://fair.example/events/winter-fair',
    });
  });

  it('finds an Event subtype in an array and takes a plain-text location', () => {
    expect(page('array.html').structuredEvent).toEqual({
      name: 'Choir concert',
      startDate: '2026-12-10T19:30:00Z',
      endDate: null,
      location: "St Mary's church",
      url: null,
    });
  });

  it('looks inside @graph, with an address given as text', () => {
    const e = page('graph.html').structuredEvent;
    expect(e?.name).toBe('Park run');
    expect(e?.location).toBe('Riverside park, Springfield');
  });

  it('keeps a date-only start and a start with no offset as written', () => {
    expect(page('date-only.html').structuredEvent).toMatchObject({
      startDate: '2026-12-21',
      endDate: '2027-01-02',
    });
    expect(page('no-offset.html').structuredEvent).toMatchObject({
      startDate: '2026-12-08T19:00',
      location: 'Library',
    });
  });

  it('counts several distinct events and proposes none of them', () => {
    const p = page('several.html');
    expect(p.structuredEvent).toBeUndefined();
    expect(p.structuredEventCount).toBe(2);
  });

  it('finds nothing on an article, and skips JSON that does not parse', () => {
    const p = page('article.html');
    expect(p.structuredEvent).toBeUndefined();
    expect(p.structuredEventCount).toBeUndefined();
    expect(p.title).toBe('How to plan a winter fair');
  });

  it('ignores an event without a start and clips a long location', () => {
    const long = 'x'.repeat(EVENT_LOCATION_MAX + 50);
    expect(structuredEvents([{ '@type': 'Event', name: 'No date' }])).toEqual({});
    const r = structuredEvents([{ '@type': 'Event', startDate: '2026-12-03', location: long }]);
    expect(Array.from(r.structuredEvent?.location ?? '')).toHaveLength(EVENT_LOCATION_MAX);
  });
});
