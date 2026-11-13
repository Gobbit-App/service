import { describe, expect, it, vi } from 'vitest';
import { EVENT_EXTRACT_EVENT, logEventExtract, resolveEventZone } from './event-extract';

describe('resolveEventZone (D374)', () => {
  it("uses the request's zone when it is a real IANA zone", () => {
    expect(resolveEventZone({ timeZone: ' Europe/Paris ' }, 'UTC')).toEqual({
      timeZone: 'Europe/Paris',
      zoneSource: 'request',
    });
  });

  it.each([undefined, '', 'Mars/Base'])('falls back for %s', (timeZone) => {
    expect(resolveEventZone({ timeZone }, 'Europe/London')).toEqual({
      timeZone: 'Europe/London',
      zoneSource: 'fallback',
    });
  });
});

describe('logEventExtract (D378)', () => {
  const ids = { jobId: 'j1', deckId: 'd1', userId: 'u1', itemId: 'i1' };

  it('logs a proposed event with its sources and ids', () => {
    const info = vi.fn();
    logEventExtract({ info }, ids, {
      outcome: 'event_proposed',
      dateSource: 'structured',
      zoneSource: 'request',
    });
    expect(info).toHaveBeenCalledWith(
      {
        event: EVENT_EXTRACT_EVENT,
        outcome: 'event_proposed',
        dateSource: 'structured',
        zoneSource: 'request',
        ...ids,
      },
      'share proposed as an event',
    );
  });

  it('logs a fallback with its reason', () => {
    const info = vi.fn();
    logEventExtract({ info }, ids, { outcome: 'event_fallback', reason: 'no_start' });
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'event_fallback', reason: 'no_start' }),
      'share not proposed as an event',
    );
  });
});
