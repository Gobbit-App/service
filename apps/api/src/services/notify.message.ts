import type { PushMessage } from '@gobbit/shared';
import { reminderDueEmail, type RenderedMail } from '../mail/templates';

/** What both channels say about a due reminder (FR-011: title, deck, deadline, link). */
export interface ReminderNotice {
  itemId: string;
  title: string;
  deckName: string;
  deadline: Date;
  timeZone: string;
}

/** The deadline in the reminder's own time zone ("Nov 3, 2026, 9:00 AM GMT+2"). */
export function formatDue(deadline: Date, timeZone: string): string {
  try {
    // Explicit parts: `dateStyle`/`timeStyle` can't be combined with `timeZoneName`.
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(deadline);
  } catch {
    // A zone the runtime no longer knows: fall back to UTC rather than drop the notice.
    return `${deadline.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  }
}

/** D296: the push payload; `tag` lets a newer notice for the same card replace the old one. */
export function reminderPushMessage(n: ReminderNotice): PushMessage {
  return {
    title: n.title,
    body: `${n.deckName} · due ${formatDue(n.deadline, n.timeZone)}`,
    url: `/i/${n.itemId}`,
    tag: n.itemId,
  };
}

export function reminderEmail(n: ReminderNotice, appUrl: string): RenderedMail {
  return reminderDueEmail({
    title: n.title,
    deckName: n.deckName,
    due: formatDue(n.deadline, n.timeZone),
    link: `${appUrl}/i/${n.itemId}`,
    settingsLink: `${appUrl}/settings`,
  });
}

/** D295: exponential backoff — base × 2^(attempt − 1) seconds after the failed attempt. */
export function retryDelayMs(attempts: number, baseSeconds: number): number {
  return baseSeconds * 1000 * 2 ** Math.max(0, attempts - 1);
}
