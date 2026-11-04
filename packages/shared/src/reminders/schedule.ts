import { UNIT_MS, type ShowBeforeUnit } from './constants';

export interface ShowBeforeValue {
  amount: number;
  unit: ShowBeforeUnit;
}

const toDate = (d: Date | string): Date => (typeof d === 'string' ? new Date(d) : d);

/** Length of a show-before period in milliseconds. */
export function showBeforeMs(v: ShowBeforeValue): number {
  return v.amount * UNIT_MS[v.unit];
}

/** D291: the instant a reminder becomes visible (instant arithmetic, same as the DB trigger). */
export function revealAt(deadline: Date | string, showBefore: ShowBeforeValue): Date {
  return new Date(toDate(deadline).getTime() - showBeforeMs(showBefore));
}

/** FR-008/009: overdue once the deadline has passed. */
export function isOverdue(deadline: Date | string, now: Date): boolean {
  return toDate(deadline).getTime() <= now.getTime();
}
