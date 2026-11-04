import type { Item } from '@gobbit/shared';
import type { ReactElement } from 'react';
import { reminderStatus } from './reminder-status';
import { useMemberName } from './use-member-name';
import './reminders.css';

/** 037: the status line on a reminder card (due, overdue, done, dismissed, shows on). */
export function ReminderStatus({ item }: { item: Item }): ReactElement | null {
  const reminder = item.reminder;
  const settled = reminder !== undefined && reminder.state !== 'pending';
  const nameOf = useMemberName(item.deckId, settled);
  if (!reminder) return null;
  const { text, tone } = reminderStatus(reminder, nameOf);
  return <p className={`reminder-status reminder-status--${tone}`}>{text}</p>;
}
