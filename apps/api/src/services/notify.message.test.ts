import { describe, expect, it } from 'vitest';
import {
  eventPushMessage,
  formatDue,
  formatEventStart,
  reminderEmail,
  reminderPushMessage,
  retryDelayMs,
} from './notify.message';

const deadline = new Date('2026-11-03T07:00:00Z');
const notice = {
  itemId: 'item-1',
  title: 'Pay <rent>',
  deckName: 'Home',
  deadline,
  timeZone: 'Asia/Jerusalem',
};

describe('formatDue', () => {
  it('shows the deadline in the reminder time zone', () => {
    expect(formatDue(deadline, 'Asia/Jerusalem')).toBe('Nov 3, 2026, 9:00 AM GMT+2');
    expect(formatDue(deadline, 'UTC')).toBe('Nov 3, 2026, 7:00 AM UTC');
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(formatDue(deadline, 'Mars/Olympus')).toBe('2026-11-03 07:00 UTC');
  });
});

describe('reminderPushMessage', () => {
  it('has the title, deck, due time, card link and a per-card tag', () => {
    expect(reminderPushMessage(notice)).toEqual({
      title: 'Pay <rent>',
      body: 'Home · due Nov 3, 2026, 9:00 AM GMT+2',
      url: '/i/item-1',
      tag: 'item-1',
    });
  });
});

describe('reminderEmail', () => {
  it('links the card and the settings page on the app origin, escaping the html', () => {
    const mail = reminderEmail(notice, 'https://app.example.test');
    expect(mail.subject).toBe('Reminder: Pay <rent>');
    expect(mail.text).toContain('https://app.example.test/i/item-1');
    expect(mail.text).toContain('https://app.example.test/settings');
    expect(mail.html).toContain('Pay &lt;rent&gt;');
    expect(mail.html).not.toContain('<rent>');
  });
});

describe('retryDelayMs', () => {
  it('doubles from the base after each attempt', () => {
    expect(retryDelayMs(1, 60)).toBe(60_000);
    expect(retryDelayMs(2, 60)).toBe(120_000);
    expect(retryDelayMs(4, 60)).toBe(480_000);
    expect(retryDelayMs(0, 60)).toBe(60_000);
  });
});

describe('eventPushMessage (042)', () => {
  const event = {
    itemId: 'item-2',
    noticeId: 'n-1',
    title: 'School fair',
    deckName: 'Family',
    startsAt: new Date('2026-12-03T16:00:00Z'),
    allDay: false,
    timeZone: 'Asia/Jerusalem',
  };

  it('says the deck and the start in the event zone, tagged per notice', () => {
    expect(eventPushMessage(event)).toEqual({
      title: 'School fair',
      body: 'Family · Dec 3, 2026, 6:00 PM GMT+2',
      url: '/i/item-2',
      tag: 'event:item-2:n-1',
    });
  });

  it('adds the location when there is one', () => {
    expect(eventPushMessage({ ...event, location: 'Town hall' }).body).toBe(
      'Family · Dec 3, 2026, 6:00 PM GMT+2 · Town hall',
    );
  });

  it('shows only the date for an all-day event', () => {
    const allDay = { ...event, allDay: true, startsAt: new Date('2026-12-02T22:00:00Z') };
    expect(eventPushMessage(allDay).body).toBe('Family · Thu, Dec 3, 2026');
  });

  it('falls back to the UTC date for an unknown zone', () => {
    expect(formatEventStart(new Date('2026-12-03T00:00:00Z'), true, 'Mars/Olympus')).toBe(
      '2026-12-03',
    );
  });
});
