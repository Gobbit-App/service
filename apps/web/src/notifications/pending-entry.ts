import type { PendingItem } from '@gobbit/shared/reminders';
import { formatDuration, formatWhen } from '../reminders/reminder-status';

export type EntryMeta = { text: string; overdue: boolean };

/**
 * 037 (D298): the line under an entry on /notifications. Waiting entries say how long is left (or
 * how late it is); Upcoming ones say when they show and when they are due. The deck name leads.
 */
export function pendingEntryMeta(
  entry: PendingItem,
  section: 'waiting' | 'upcoming',
  now: Date = new Date(),
  timeZone?: string,
): EntryMeta {
  const deck = entry.deck.name;
  const due = formatWhen(entry.deadline, timeZone);
  if (section === 'upcoming') {
    return {
      text: `${deck} · Shows ${formatWhen(entry.revealAt, timeZone)} · Due ${due}`,
      overdue: false,
    };
  }
  const left = Date.parse(entry.deadline) - now.getTime();
  if (entry.overdue || left <= 0) {
    return { text: `${deck} · Overdue by ${formatDuration(left)}`, overdue: true };
  }
  return { text: `${deck} · Due in ${formatDuration(left)} · ${due}`, overdue: false };
}
