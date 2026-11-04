import { z } from 'zod';
import { codePointLength } from '../utils/utf8-bytes';
import {
  dismissModes,
  REMINDER_MAX_SHOW_BEFORE_DAYS,
  REMINDER_PEOPLE_MAX,
  REMINDER_RESOLUTION_MAX,
  reminderOutcomes,
  showBeforeUnits,
  UNIT_MS,
  type ShowBeforeUnit,
} from './constants';

const maxAmount = (unit: ShowBeforeUnit) =>
  Math.floor((REMINDER_MAX_SHOW_BEFORE_DAYS * UNIT_MS.days) / UNIT_MS[unit]);

/** True when `tz` is an IANA zone the runtime knows. */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const showBeforeSchema = z
  .object({
    amount: z.number().int().min(0),
    unit: z.enum(showBeforeUnits),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.amount > maxAmount(v.unit)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: `Show before can be at most ${REMINDER_MAX_SHOW_BEFORE_DAYS} days`,
      });
    }
  });

export const dismissRuleSchema = z
  .object({
    mode: z.enum(dismissModes),
    userIds: z
      .array(z.uuid())
      .max(REMINDER_PEOPLE_MAX)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'userIds must be unique' })
      .default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === 'people' && v.userIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['userIds'], message: 'Pick at least one person' });
    }
    if (v.mode !== 'people' && v.userIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['userIds'],
        message: 'userIds are only allowed with mode "people"',
      });
    }
  });

/**
 * D291: a reminder card's payload. The API also checks the deadline against the clock (future on
 * create/change, not too far) and the people against the deck's writers.
 */
export const reminderPayloadSchema = z
  .object({
    deadline: z.iso.datetime({ offset: true }),
    showBefore: showBeforeSchema,
    dismiss: dismissRuleSchema,
    timeZone: z.string().min(1).max(64).refine(isTimeZone, { message: 'Unknown time zone' }),
  })
  .strict();

export type ReminderPayload = z.infer<typeof reminderPayloadSchema>;
export type ReminderPayloadInput = z.input<typeof reminderPayloadSchema>;
export type ShowBefore = z.infer<typeof showBeforeSchema>;
export type DismissRule = z.infer<typeof dismissRuleSchema>;

export const reminderResolutionSchema = z
  .string()
  .trim()
  .refine((s) => codePointLength(s) <= REMINDER_RESOLUTION_MAX, {
    message: `Resolution must be at most ${REMINDER_RESOLUTION_MAX} characters`,
  });

/** D294: `POST /items/{id}/dismiss`. */
export const dismissReminderSchema = z
  .object({
    done: z.boolean(),
    resolution: reminderResolutionSchema.optional(),
  })
  .strict();

export type DismissReminder = z.infer<typeof dismissReminderSchema>;

/** D291: the reminder state on an item DTO (server-owned). */
export const reminderStateSchema = z.object({
  deadline: z.string(),
  revealAt: z.string(),
  timeZone: z.string(),
  state: z.enum(reminderOutcomes),
  dismissedBy: z.string().nullable(),
  dismissedAt: z.string().nullable(),
  resolution: z.string().nullable(),
  /** Reveal time not reached: only the creator and owners/maintainers see it. */
  hidden: z.boolean(),
  /** The caller is an eligible dismisser (D293). */
  canDismiss: z.boolean(),
  /** The caller may change who can dismiss (D293). */
  canChangeDismissers: z.boolean(),
});

export type ReminderState = z.infer<typeof reminderStateSchema>;
