import { z } from 'zod';
import { REMINDER_PEOPLE_MAX } from '../reminders/constants';
import { isTimeZone } from '../reminders/schema';
import { httpUrlSchema } from '../schemas/common';
import { storedLinkPreviewSchema } from '../schemas/link-preview';
import { codePointLength } from '../utils/utf8-bytes';
import { isIsoDate } from '../event-time/zoned';
import {
  EVENT_LOCATION_MAX,
  EVENT_NOTIFY_BEFORE_MAX_DAYS,
  EVENT_NOTIFY_DEFAULT,
  EVENT_NOTIFY_TIMES_MAX,
  EVENT_UNIT_MS,
  eventAudienceModes,
  eventNoticeStates,
  eventNoticeUnits,
  type EventNoticeUnit,
} from './constants';

const isoInstant = z.iso.datetime({ offset: true });

const maxBeforeAmount = (unit: EventNoticeUnit) =>
  Math.floor((EVENT_NOTIFY_BEFORE_MAX_DAYS * EVENT_UNIT_MS.days) / EVENT_UNIT_MS[unit]);

/** FR-010: one notify-before time (0 = at the start), at most `EVENT_NOTIFY_BEFORE_MAX_DAYS`. */
export const notifyBeforeSchema = z
  .object({
    amount: z.number().int().min(0),
    unit: z.enum(eventNoticeUnits),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.amount > maxBeforeAmount(v.unit)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: `A notice can be at most ${EVENT_NOTIFY_BEFORE_MAX_DAYS} days before`,
      });
    }
  });

/** D362: who an event notifies; `userIds` only (and required) for `people`. */
export const eventAudienceSchema = z
  .object({
    mode: z.enum(eventAudienceModes),
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

export const eventNotifySchema = z
  .object({
    before: z
      .array(notifyBeforeSchema)
      .max(EVENT_NOTIFY_TIMES_MAX, {
        message: `At most ${EVENT_NOTIFY_TIMES_MAX} notify times`,
      })
      .refine((list) => new Set(list.map((b) => `${b.amount}:${b.unit}`)).size === list.length, {
        message: 'Notify times must be unique',
      }),
    audience: eventAudienceSchema,
  })
  .strict();

const defaultNotify = () => ({
  before: EVENT_NOTIFY_DEFAULT.before.map((b) => ({ ...b })),
  audience: { mode: EVENT_NOTIFY_DEFAULT.audience.mode, userIds: [] },
});

/**
 * D356/D357: an event card's payload. All-day events carry `YYYY-MM-DD` dates, timed ones ISO
 * instants with an offset; `timeZone` is always stored. The API also checks the start against the
 * clock (`EVENT_START_MAX_DAYS`) and the audience against the deck's members.
 */
export const eventPayloadSchema = z
  .object({
    allDay: z.boolean(),
    start: z.string().min(1).max(40),
    end: z.string().min(1).max(40).optional(),
    timeZone: z.string().min(1).max(64).refine(isTimeZone, { message: 'Unknown time zone' }),
    location: z
      .string()
      .trim()
      .min(1)
      .refine((s) => codePointLength(s) <= EVENT_LOCATION_MAX, {
        message: `Location must be at most ${EVENT_LOCATION_MAX} characters`,
      })
      .optional(),
    url: httpUrlSchema.optional(),
    preview: storedLinkPreviewSchema.optional(),
    notify: eventNotifySchema.default(defaultNotify),
  })
  .strict()
  .superRefine((v, ctx) => {
    const formOk = (s: string) => (v.allDay ? isIsoDate(s) : isoInstant.safeParse(s).success);
    const formMessage = v.allDay
      ? 'All-day events use a date (YYYY-MM-DD)'
      : 'Timed events use a date and time with an offset';
    const startOk = formOk(v.start);
    if (!startOk) ctx.addIssue({ code: 'custom', path: ['start'], message: formMessage });
    if (v.end !== undefined) {
      if (!formOk(v.end)) {
        ctx.addIssue({ code: 'custom', path: ['end'], message: formMessage });
      } else if (startOk && !endAfterStart(v.allDay, v.start, v.end)) {
        ctx.addIssue({
          code: 'custom',
          path: ['end'],
          message: 'The end must be after the start',
        });
      }
    }
    if (v.allDay) {
      v.notify.before.forEach((b, i) => {
        if (b.unit !== 'days') {
          ctx.addIssue({
            code: 'custom',
            path: ['notify', 'before', i, 'unit'],
            message: 'All-day events notify in days',
          });
        }
      });
    }
  });

/** Dates compare as strings (same length, zero-padded); instants by time. */
function endAfterStart(allDay: boolean, start: string, end: string): boolean {
  return allDay ? end >= start : Date.parse(end) > Date.parse(start);
}

export type EventPayload = z.infer<typeof eventPayloadSchema>;
export type EventPayloadInput = z.input<typeof eventPayloadSchema>;
export type EventNotify = z.infer<typeof eventNotifySchema>;
export type EventAudience = z.infer<typeof eventAudienceSchema>;

/** The `Item.event` DTO field (server-owned, member paths only). */
export const eventStateSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string(),
  allDay: z.boolean(),
  timeZone: z.string(),
  notices: z.array(
    z.object({
      amount: z.number().int(),
      unit: z.enum(eventNoticeUnits),
      fireAt: z.string(),
      state: z.enum(eventNoticeStates),
    }),
  ),
  /** The caller's own mute only. */
  muted: z.boolean(),
  /** The caller would be notified (ignoring the mute). */
  inAudience: z.boolean(),
  /** D363. */
  canEditNotify: z.boolean(),
});

export type EventState = z.infer<typeof eventStateSchema>;
