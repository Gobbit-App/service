import { codePointLength } from '@gobbit/shared/card-limits';
import {
  EVENT_LOCATION_MAX,
  EVENT_NOTIFY_BEFORE_MAX_DAYS,
  EVENT_NOTIFY_DEFAULT,
  EVENT_NOTIFY_TIMES_MAX,
  EVENT_START_MAX_DAYS,
  EVENT_UNIT_MS,
  eventNoticeMoments,
  type EventAudienceMode,
  type EventNoticeUnit,
} from '@gobbit/shared/event-constants';
import { isIsoDate } from '@gobbit/shared/event-time';
import { normalizeUrlInput } from '../lib/url-input';
import { previewToPayload, type DraftLinkPreview } from './link-preview-payload';
import {
  deviceTimeZone,
  isoToLocalInput,
  localInputToIso,
  PEOPLE_REQUIRED,
} from './reminder-draft';
import type { FieldErrors } from './validate';

/** One notify-before row while editing; the amount is the input's text. */
export type EventNotifyRow = { amount: string; unit: EventNoticeUnit };

/** The times as saved, so untouched times go back unchanged (zone included). */
export type EventStoredTimes = {
  allDay: boolean;
  start: string;
  end: string | null;
  timeZone: string;
};

/**
 * 042 (D356/D357): an event payload while editing. `start`/`end` are `datetime-local` values in the
 * device zone for timed events and `YYYY-MM-DD` dates for all-day ones (`end` '' = none).
 */
export type EventDraftPayload = {
  allDay: boolean;
  start: string;
  end: string;
  timeZone: string;
  stored: EventStoredTimes | null;
  location: string;
  /** '' = no link. */
  url: string;
  preview?: DraftLinkPreview;
  notify: {
    before: EventNotifyRow[];
    audience: { mode: EventAudienceMode; userIds: string[] };
  };
};

export const START_REQUIRED = 'Pick when it starts';
export const END_BEFORE_START = 'The end must be after the start';
export const START_TOO_FAR = `The start can be at most ${Math.floor(EVENT_START_MAX_DAYS / 365)} years ahead`;
export const LOCATION_TOO_LONG = `Location must be at most ${EVENT_LOCATION_MAX} characters`;
export const TIMES_DUPLICATE = 'Each notify time can be used once';
export const NOTIFY_LOCKED = 'Only the person who made this event can change its notifications';

/** A new event starts tomorrow at 18:00 (no end, timed). */
export const NEW_EVENT_HOUR = 18;

const pad = (n: number) => String(n).padStart(2, '0');
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isUnit = (v: unknown): v is EventNoticeUnit =>
  v === 'minutes' || v === 'hours' || v === 'days';
const isMode = (v: unknown): v is EventAudienceMode =>
  v === 'everyone' || v === 'people' || v === 'me' || v === 'nobody';

function defaultNotify(): EventDraftPayload['notify'] {
  return {
    before: EVENT_NOTIFY_DEFAULT.before.map((b) => ({ amount: String(b.amount), unit: b.unit })),
    audience: { mode: EVENT_NOTIFY_DEFAULT.audience.mode, userIds: [] },
  };
}

/** FR-010: a new event, tomorrow 18:00 in the device zone, notifying everyone a day before. */
export function newEventPayload(now: Date = new Date()): EventDraftPayload {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, NEW_EVENT_HOUR, 0);
  return {
    allDay: false,
    start: isoToLocalInput(start.toISOString()),
    end: '',
    timeZone: deviceTimeZone(),
    stored: null,
    location: '',
    url: '',
    notify: defaultNotify(),
  };
}

/** A stored time as the input shows it (a date stays a date). */
function storedToInput(allDay: boolean, value: string | null): string {
  if (value === null) return '';
  return allDay ? value : isoToLocalInput(value);
}

/** A stored event payload as a draft; unreadable parts fall back to the new defaults. */
export function eventDraftFromPayload(raw: Record<string, unknown>): EventDraftPayload {
  const fallback = newEventPayload();
  const allDay = raw['allDay'] === true;
  const start = typeof raw['start'] === 'string' ? raw['start'] : null;
  const end = typeof raw['end'] === 'string' ? raw['end'] : null;
  const timeZone = typeof raw['timeZone'] === 'string' ? raw['timeZone'] : fallback.timeZone;
  const notify = isRecord(raw['notify']) ? raw['notify'] : null;
  const audience = notify && isRecord(notify['audience']) ? notify['audience'] : null;
  const before = notify && Array.isArray(notify['before']) ? notify['before'] : null;

  return {
    allDay,
    start: start === null ? fallback.start : storedToInput(allDay, start),
    end: storedToInput(allDay, end),
    timeZone,
    stored: start === null ? null : { allDay, start, end, timeZone },
    location: typeof raw['location'] === 'string' ? raw['location'] : '',
    url: typeof raw['url'] === 'string' ? raw['url'] : '',
    ...(isRecord(raw['preview'])
      ? { preview: structuredClone(raw['preview']) as DraftLinkPreview }
      : {}),
    notify: {
      before: before
        ? before
            .filter(isRecord)
            .filter((b) => typeof b['amount'] === 'number' && isUnit(b['unit']))
            .map((b) => ({ amount: String(b['amount']), unit: b['unit'] as EventNoticeUnit }))
        : fallback.notify.before,
      audience: {
        mode: audience && isMode(audience['mode']) ? audience['mode'] : 'everyone',
        userIds:
          audience && Array.isArray(audience['userIds'])
            ? audience['userIds'].filter((id): id is string => typeof id === 'string')
            : [],
      },
    },
  };
}

/** True when the time inputs still show the saved times. */
export function timesUnchanged(p: EventDraftPayload): boolean {
  const s = p.stored;
  return (
    s !== null &&
    s.allDay === p.allDay &&
    storedToInput(s.allDay, s.start) === p.start &&
    storedToInput(s.allDay, s.end) === p.end
  );
}

/** The times as the API expects them; untouched times keep their saved values and zone. */
export function eventTimes(p: EventDraftPayload): {
  allDay: boolean;
  start: string;
  end?: string;
  timeZone: string;
} {
  if (timesUnchanged(p) && p.stored) {
    const { allDay, start, end, timeZone } = p.stored;
    return end === null ? { allDay, start, timeZone } : { allDay, start, end, timeZone };
  }
  const toApi = (value: string) => (p.allDay ? value : (localInputToIso(value) ?? value));
  const start = toApi(p.start);
  const timeZone = deviceTimeZone();
  return p.end.trim() === ''
    ? { allDay: p.allDay, start, timeZone }
    : { allDay: p.allDay, start, end: toApi(p.end), timeZone };
}

/** Notify rows as the API expects them (all-day events notify in days). */
function notifyToPayload(p: EventDraftPayload) {
  return {
    before: p.notify.before.map((b) => ({
      amount: Number(b.amount.trim()),
      unit: p.allDay ? 'days' : b.unit,
    })),
    audience: {
      mode: p.notify.audience.mode,
      userIds: p.notify.audience.mode === 'people' ? p.notify.audience.userIds : [],
    },
  };
}

/** The payload as the API expects it: blank location and link dropped, link preview cleaned. */
export function eventToPayload(p: EventDraftPayload): Record<string, unknown> {
  const out: Record<string, unknown> = { ...eventTimes(p) };
  const location = p.location.trim();
  if (location !== '') out['location'] = location;
  const url = normalizeUrlInput(p.url);
  if (url !== '') {
    out['url'] = url;
    const preview = previewToPayload(p.preview);
    if (preview) out['preview'] = preview;
  }
  out['notify'] = notifyToPayload(p);
  return out;
}

/** Whole days covered by a notify-before row (rounded, at least 1 unless it is 0). */
function rowInDays(row: EventNotifyRow): string {
  const amount = Number(row.amount.trim());
  if (!Number.isFinite(amount) || row.unit === 'days') return row.amount;
  if (amount === 0) return '0';
  return String(Math.max(1, Math.round((amount * EVENT_UNIT_MS[row.unit]) / EVENT_UNIT_MS.days)));
}

/**
 * The "All day" switch. On: the dates of the start and end (an end on the start day is dropped);
 * notify rows become days. Off: the start date at 18:00, no end.
 */
export function withAllDay(p: EventDraftPayload, allDay: boolean): EventDraftPayload {
  if (p.allDay === allDay) return p;
  if (allDay) {
    const start = p.start.slice(0, 10);
    const end = p.end.slice(0, 10);
    const byAmount = new Map<string, EventNotifyRow>();
    for (const row of p.notify.before) {
      const amount = rowInDays(row);
      if (!byAmount.has(amount)) byAmount.set(amount, { amount, unit: 'days' });
    }
    const before = [...byAmount.values()];
    return {
      ...p,
      allDay,
      start,
      end: end === start ? '' : end,
      notify: { ...p.notify, before },
    };
  }
  const date = p.start.slice(0, 10);
  return {
    ...p,
    allDay,
    start: date === '' ? '' : `${date}T${pad(NEW_EVENT_HOUR)}:00`,
    end: '',
  };
}

/** "At the start", "1 day before", "2 hours before". */
export function noticeLabel(amount: number, unit: EventNoticeUnit): string {
  if (amount === 0) return 'At the start';
  const name = amount === 1 ? unit.slice(0, -1) : unit;
  return `${amount} ${name} before`;
}

const AUDIENCE_SUMMARY: Record<EventAudienceMode, string> = {
  everyone: 'Everyone who can read it',
  people: 'Specific people',
  me: 'Only me',
  nobody: 'Nobody',
};

/** The collapsed Notifications summary ("1 day before · Everyone who can read it"). */
export function notifySummary(p: EventDraftPayload, personal: boolean): string {
  const times = p.notify.before
    .map((b) => ({ amount: Number(b.amount.trim()), unit: p.allDay ? 'days' : b.unit }))
    .filter((b) => Number.isInteger(b.amount) && b.amount >= 0)
    .map((b) => noticeLabel(b.amount, b.unit as EventNoticeUnit));
  if (p.notify.audience.mode === 'nobody' && !personal) return 'Nobody is notified';
  if (times.length === 0) return 'No notifications';
  return personal
    ? times.join(', ')
    : `${times.join(', ')} · ${AUDIENCE_SUMMARY[p.notify.audience.mode]}`;
}

/** The largest amount for a unit (FR-010: at most 365 days). */
export function maxNoticeAmount(unit: EventNoticeUnit): number {
  return Math.floor((EVENT_NOTIFY_BEFORE_MAX_DAYS * EVENT_UNIT_MS.days) / EVENT_UNIT_MS[unit]);
}

/** Labels of valid notify times that are already past at `now` (FR-016 edge: they're skipped). */
export function pastNoticeLabels(p: EventDraftPayload, now: Date = new Date()): string[] {
  const times = eventTimes(p);
  if (p.allDay ? !isIsoDate(times.start) : localInputToIso(p.start) === null) return [];
  const before = notifyToPayload(p).before.filter(
    (b) => Number.isInteger(b.amount) && b.amount >= 0 && b.amount <= maxNoticeAmount(b.unit),
  );
  try {
    return eventNoticeMoments({ ...times, notify: { before } })
      .filter((m) => m.fireAt.getTime() <= now.getTime())
      .map((m) => noticeLabel(m.amount, m.unit));
  } catch {
    return [];
  }
}

function startMs(p: EventDraftPayload, value: string): number | null {
  if (p.allDay) return isIsoDate(value) ? Date.parse(`${value}T00:00:00Z`) : null;
  const iso = localInputToIso(value);
  return iso === null ? null : Date.parse(iso);
}

function checkTimes(p: EventDraftPayload, errors: FieldErrors, now: Date): void {
  const start = startMs(p, p.start);
  if (p.start.trim() === '' || start === null) {
    errors['payload.start'] = START_REQUIRED;
    return;
  }
  if (!timesUnchanged(p) && start - now.getTime() > EVENT_START_MAX_DAYS * EVENT_UNIT_MS.days) {
    errors['payload.start'] = START_TOO_FAR;
  }
  if (p.end.trim() === '') return;
  const end = startMs(p, p.end);
  if (end === null) errors['payload.end'] = p.allDay ? 'Pick a date' : 'Pick a date and time';
  else if (p.allDay ? end < start : end <= start) errors['payload.end'] = END_BEFORE_START;
}

function checkNotify(p: EventDraftPayload, errors: FieldErrors): void {
  const rows = p.notify.before;
  if (rows.length > EVENT_NOTIFY_TIMES_MAX) {
    errors['payload.notify.before'] = `At most ${EVENT_NOTIFY_TIMES_MAX} notify times`;
  }
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const raw = row.amount.trim();
    const amount = Number(raw);
    const unit = p.allDay ? 'days' : row.unit;
    const path = `payload.notify.before.${i}.amount`;
    if (raw === '' || !Number.isInteger(amount) || amount < 0)
      errors[path] = 'Enter a whole number';
    else if (amount > maxNoticeAmount(unit)) {
      errors[path] = `A notice can be at most ${EVENT_NOTIFY_BEFORE_MAX_DAYS} days before`;
    } else if (seen.has(`${amount}:${unit}`)) errors[path] = TIMES_DUPLICATE;
    seen.add(`${amount}:${unit}`);
  });
  if (p.notify.audience.mode === 'people' && p.notify.audience.userIds.length === 0) {
    errors['payload.notify.audience.userIds'] = PEOPLE_REQUIRED;
  }
}

/**
 * R6 mirror of the server's event rules (zod-free); the server stays authoritative. The optional
 * link is checked by `validateDraft` with the link rules.
 */
export function checkEvent(
  p: EventDraftPayload,
  errors: FieldErrors,
  now: Date = new Date(),
): void {
  checkTimes(p, errors, now);
  if (codePointLength(p.location.trim()) > EVENT_LOCATION_MAX) {
    errors['payload.location'] = LOCATION_TOO_LONG;
  }
  checkNotify(p, errors);
}
