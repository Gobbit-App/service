import {
  REMINDER_MAX_SHOW_BEFORE_DAYS,
  SHOW_BEFORE_DEFAULT,
  UNIT_MS,
  type DismissMode,
  type ShowBeforeUnit,
} from '@gobbit/shared/reminder-constants';
import type { FieldErrors } from './validate';
import { deviceTimeZone } from '../lib/device-time-zone';

/**
 * 037 (D291): a reminder payload while editing. The deadline is a `datetime-local` value in the
 * device's time zone; `storedDeadline` is the saved instant, kept so an untouched deadline is sent
 * back unchanged (an unchanged past deadline is allowed, a changed one must be in the future).
 */
export type ReminderDraftPayload = {
  deadline: string;
  storedDeadline: string | null;
  timeZone: string;
  showBefore: { amount: string; unit: ShowBeforeUnit };
  dismiss: { mode: DismissMode; userIds: string[] };
};

export const DEADLINE_REQUIRED = 'Pick a date and time';
export const DEADLINE_IN_PAST = 'The deadline must be in the future';
export const PEOPLE_REQUIRED = 'Pick at least one person';

const pad = (n: number) => String(n).padStart(2, '0');

export { deviceTimeZone };

/** An instant as a `datetime-local` value in the device's zone (minute precision). */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value (device zone) as an ISO instant; null when it isn't a date. */
export function localInputToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** FR-003: a new reminder is due tomorrow at 09:00, shown 24 hours before, writers dismiss. */
export function newReminderPayload(now: Date = new Date()): ReminderDraftPayload {
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  return {
    deadline: isoToLocalInput(due.toISOString()),
    storedDeadline: null,
    timeZone: deviceTimeZone(),
    showBefore: { amount: String(SHOW_BEFORE_DEFAULT.amount), unit: SHOW_BEFORE_DEFAULT.unit },
    dismiss: { mode: 'writers', userIds: [] },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A stored reminder payload as a draft; anything unreadable falls back to the new defaults. */
export function reminderDraftFromPayload(raw: Record<string, unknown>): ReminderDraftPayload {
  const fallback = newReminderPayload();
  const deadline = typeof raw['deadline'] === 'string' ? raw['deadline'] : null;
  const showBefore = isRecord(raw['showBefore']) ? raw['showBefore'] : {};
  const dismiss = isRecord(raw['dismiss']) ? raw['dismiss'] : {};
  const unit = showBefore['unit'];
  const mode = dismiss['mode'];
  return {
    deadline: deadline ? isoToLocalInput(deadline) : fallback.deadline,
    storedDeadline: deadline,
    timeZone: typeof raw['timeZone'] === 'string' ? raw['timeZone'] : fallback.timeZone,
    showBefore: {
      amount:
        typeof showBefore['amount'] === 'number'
          ? String(showBefore['amount'])
          : fallback.showBefore.amount,
      unit: unit === 'minutes' || unit === 'hours' || unit === 'days' ? unit : 'hours',
    },
    dismiss: {
      mode: mode === 'me' || mode === 'writers' || mode === 'people' ? mode : 'writers',
      userIds: Array.isArray(dismiss['userIds'])
        ? dismiss['userIds'].filter((id): id is string => typeof id === 'string')
        : [],
    },
  };
}

/** True when the deadline input still shows the saved instant. */
function deadlineUnchanged(p: ReminderDraftPayload): boolean {
  return p.storedDeadline !== null && isoToLocalInput(p.storedDeadline) === p.deadline;
}

/**
 * The payload as the API expects it. An untouched deadline keeps its saved instant and zone; a
 * new or changed one is sent in the device's zone.
 */
export function reminderToPayload(p: ReminderDraftPayload): Record<string, unknown> {
  const unchanged = deadlineUnchanged(p);
  const deadline = unchanged ? p.storedDeadline : localInputToIso(p.deadline);
  return {
    deadline: deadline ?? p.deadline,
    showBefore: { amount: Number(p.showBefore.amount.trim()), unit: p.showBefore.unit },
    dismiss: {
      mode: p.dismiss.mode,
      userIds: p.dismiss.mode === 'people' ? p.dismiss.userIds : [],
    },
    timeZone: unchanged ? p.timeZone : deviceTimeZone(),
  };
}

/** The largest show-before amount for a unit (D299, the shared cap). */
export function maxShowBefore(unit: ShowBeforeUnit): number {
  return Math.floor((REMINDER_MAX_SHOW_BEFORE_DAYS * UNIT_MS.days) / UNIT_MS[unit]);
}

/** R6 mirror of the server rules for a reminder (zod-free); the server stays authoritative. */
export function checkReminder(
  p: ReminderDraftPayload,
  errors: FieldErrors,
  now: Date = new Date(),
): void {
  const iso = localInputToIso(p.deadline);
  if (p.deadline.trim() === '' || iso === null) errors['payload.deadline'] = DEADLINE_REQUIRED;
  else if (!deadlineUnchanged(p) && Date.parse(iso) <= now.getTime()) {
    errors['payload.deadline'] = DEADLINE_IN_PAST;
  }

  const raw = p.showBefore.amount.trim();
  const amount = Number(raw);
  if (raw === '' || !Number.isInteger(amount) || amount < 0) {
    errors['payload.showBefore.amount'] = 'Enter a whole number';
  } else if (amount > maxShowBefore(p.showBefore.unit)) {
    errors['payload.showBefore.amount'] =
      `Show before can be at most ${REMINDER_MAX_SHOW_BEFORE_DAYS} days`;
  }

  if (p.dismiss.mode === 'people' && p.dismiss.userIds.length === 0) {
    errors['payload.dismiss.userIds'] = PEOPLE_REQUIRED;
  }
}
