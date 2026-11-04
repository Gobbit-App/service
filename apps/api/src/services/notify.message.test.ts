import { describe, expect, it } from 'vitest';
import { formatDue, reminderEmail, reminderPushMessage, retryDelayMs } from './notify.message';

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
