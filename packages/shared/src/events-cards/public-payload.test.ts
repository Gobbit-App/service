import { describe, expect, it } from 'vitest';
import { eventPublicPayload } from './public-payload';

describe('eventPublicPayload', () => {
  it('keeps content and drops notify and snapshot markers', () => {
    const stored = {
      allDay: false,
      start: '2026-12-03T18:00:00+02:00',
      end: '2026-12-03T20:00:00+02:00',
      timeZone: 'Asia/Jerusalem',
      location: 'Hall',
      url: 'https://example.com',
      preview: { title: 'T', description: 'D', publicId: 'p', imageLookup: 1, imageRemoved: true },
      notify: {
        before: [{ amount: 1, unit: 'days' }],
        audience: { mode: 'people', userIds: ['x'] },
      },
    } as const;
    expect(eventPublicPayload(stored)).toEqual({
      allDay: false,
      start: '2026-12-03T18:00:00+02:00',
      end: '2026-12-03T20:00:00+02:00',
      timeZone: 'Asia/Jerusalem',
      location: 'Hall',
      url: 'https://example.com',
      preview: { title: 'T', description: 'D', publicId: 'p' },
    });
  });

  it('omits absent optional fields', () => {
    expect(eventPublicPayload({ allDay: true, start: '2026-12-03', timeZone: 'UTC' })).toEqual({
      allDay: true,
      start: '2026-12-03',
      timeZone: 'UTC',
    });
  });
});
