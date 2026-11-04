import type { ReminderState } from '@gobbit/shared';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type StatusTone = 'normal' | 'warning' | 'muted';

export type ReminderStatusCopy = { text: string; tone: StatusTone };

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "45 minutes", "3 hours", "2 days": the largest whole unit (at least 1 minute). */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  if (abs >= 2 * DAY) return plural(Math.floor(abs / DAY), 'day');
  if (abs >= HOUR) return plural(Math.floor(abs / HOUR), 'hour');
  return plural(Math.max(1, Math.floor(abs / MINUTE)), 'minute');
}

/** "Tue 5 Nov, 09:00" in the viewer's zone (or `timeZone` for tests). */
export function formatWhen(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`;
}

/**
 * contracts/web-ui.md: the line on a reminder card. `nameOf` resolves the dismisser ("you" for
 * the viewer); a resolution follows the outcome after " · ".
 */
export function reminderStatus(
  reminder: ReminderState,
  nameOf: (userId: string | null) => string,
  now: Date = new Date(),
  timeZone?: string,
): ReminderStatusCopy {
  const withResolution = (text: string) =>
    reminder.resolution ? `${text} · ${reminder.resolution}` : text;

  if (reminder.state === 'done') {
    return { text: withResolution(`Done by ${nameOf(reminder.dismissedBy)}`), tone: 'muted' };
  }
  if (reminder.state === 'dismissed') {
    return { text: withResolution(`Dismissed by ${nameOf(reminder.dismissedBy)}`), tone: 'muted' };
  }

  const due = formatWhen(reminder.deadline, timeZone);
  if (reminder.hidden) {
    return {
      text: `Shows on ${formatWhen(reminder.revealAt, timeZone)} · Due ${due}`,
      tone: 'muted',
    };
  }
  const left = Date.parse(reminder.deadline) - now.getTime();
  if (left <= 0) return { text: `Overdue by ${formatDuration(left)}`, tone: 'warning' };
  return { text: `Due in ${formatDuration(left)} · ${due}`, tone: 'normal' };
}
