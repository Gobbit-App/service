import { describe, expect, it } from 'vitest';
import { escapeIcsText, foldIcsLine, icsFileName, toIcs, type IcsEvent } from './to-ics';

const now = new Date('2026-11-09T08:30:00Z');
const cardUrl = 'https://gobbit.app/d/family/i/itm_1';

const timed: IcsEvent = {
  id: 'itm_1',
  title: 'School fair',
  allDay: false,
  start: '2026-12-03T16:00:00.000Z',
  end: '2026-12-03T18:30:00.000Z',
  timeZone: 'Asia/Jerusalem',
};

const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const lines = (ics: string) => unfold(ics).split('\r\n');

describe('toIcs (D368)', () => {
  it('writes a timed event in UTC with CRLF endings', () => {
    const ics = toIcs(timed, { cardUrl, now });
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/\n/);
    expect(lines(ics)).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Gobbit//Events//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:itm_1@gobbit',
      'DTSTAMP:20261109T083000Z',
      'DTSTART:20261203T160000Z',
      'DTEND:20261203T183000Z',
      'SUMMARY:School fair',
      `URL:${cardUrl}`,
      `DESCRIPTION:${cardUrl}\\nTime zone: Asia/Jerusalem`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ]);
  });

  it('gives a timed event without an end the default hour', () => {
    const ics = toIcs({ ...timed, end: undefined }, { cardUrl, now });
    expect(lines(ics)).toContain('DTEND:20261203T170000Z');
  });

  it('writes all-day events as DATE values with an exclusive end', () => {
    const ics = toIcs(
      { ...timed, allDay: true, start: '2026-12-31', end: '2027-01-02' },
      { cardUrl, now },
    );
    expect(lines(ics)).toContain('DTSTART;VALUE=DATE:20261231');
    expect(lines(ics)).toContain('DTEND;VALUE=DATE:20270103');
    expect(ics).not.toContain('Time zone');
  });

  it('ends a single all-day event the next day', () => {
    const ics = toIcs(
      { ...timed, allDay: true, start: '2026-12-03', end: undefined },
      { cardUrl, now },
    );
    expect(lines(ics)).toContain('DTEND;VALUE=DATE:20261204');
  });

  it('adds the location and the event link, escaped', () => {
    const ics = toIcs(
      {
        ...timed,
        title: 'Fair; bring cake, chairs',
        location: 'Hall 2, Main St\\Back',
        url: 'https://example.org/fair',
      },
      { cardUrl, now },
    );
    const all = lines(ics);
    expect(all).toContain('SUMMARY:Fair\\; bring cake\\, chairs');
    expect(all).toContain('LOCATION:Hall 2\\, Main St\\\\Back');
    expect(all).toContain(
      `DESCRIPTION:${cardUrl}\\nhttps://example.org/fair\\nTime zone: Asia/Jerusalem`,
    );
  });
});

describe('escapeIcsText', () => {
  it('escapes backslash first, then separators and newlines', () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });
});

describe('foldIcsLine', () => {
  const octets = (s: string) => new TextEncoder().encode(s).length;

  it('leaves lines of 75 octets alone', () => {
    const line = 'x'.repeat(75);
    expect(foldIcsLine(line)).toBe(line);
  });

  it('folds longer lines at 75 octets, continuation lines included', () => {
    const line = `SUMMARY:${'a'.repeat(200)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) expect(octets(part)).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('never splits a multi-byte character', () => {
    const line = `SUMMARY:${'שלום 🎉 '.repeat(20)}`;
    const folded = foldIcsLine(line);
    for (const part of folded.split('\r\n')) {
      expect(octets(part)).toBeLessThanOrEqual(75);
      expect(part).not.toMatch(/�/);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('icsFileName', () => {
  it('uses the title without reserved characters', () => {
    expect(icsFileName('Fair: 3/12 "big"')).toBe('Fair 3 12 big.ics');
  });

  it('falls back to "event"', () => {
    expect(icsFileName('  ')).toBe('event.ics');
  });
});
