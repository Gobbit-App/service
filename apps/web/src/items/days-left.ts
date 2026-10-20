import { ITEM_UNDELETE_DAYS } from '@pb/shared/item-constants';

const DAY_MS = 86_400_000;

/** D132: whole days left to undelete a card deleted at `deletedAt` (floored, never < 0). */
export function daysLeft(
  deletedAt: string,
  now: Date = new Date(),
  windowDays: number = ITEM_UNDELETE_DAYS,
): number {
  const remaining = new Date(deletedAt).getTime() + windowDays * DAY_MS - now.getTime();
  return Math.max(0, Math.floor(remaining / DAY_MS));
}

/** "30 days left", "1 day left", "Less than a day left". */
export function daysLeftLabel(days: number): string {
  if (days <= 0) return 'Less than a day left';
  return days === 1 ? '1 day left' : `${days} days left`;
}
