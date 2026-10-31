import {
  waitlistJoinSchema,
  waitlistKinds,
  type WaitlistJoinInput as WaitlistJoinFields,
  type WaitlistKind,
} from '@gobbit/shared';
import { LANDING_COPY_EN, type LandingCopy } from './landing-copy';

/** Fields that can carry a message on the page; `utm_source` and the honeypot never do. */
export type LandingField = 'email' | 'kind' | 'note';

/** What the form re-shows: values as typed (escaped on render), utm only when valid. */
export type LandingFormValues = {
  email: string;
  kind?: WaitlistKind;
  note: string;
  utmSource?: string;
};

export type LandingFormErrors = Partial<Record<LandingField, string>>;

export type LandingFormResult =
  | { ok: true; input: WaitlistJoinFields; values: LandingFormValues }
  | { ok: false; values: LandingFormValues; errors: LandingFormErrors };

/** A urlencoded body as Hono's `parseBody()` returns it. */
export type FormBody = Record<string, unknown>;

/** 028's schema caps free-text extras at 256; longer ones are cut, never an error the visitor sees. */
const EXTRA_MAX = 256;

function field(body: FormBody, name: string): string {
  const value = body[name];
  return typeof value === 'string' ? value : '';
}

function isKind(value: string): value is WaitlistKind {
  return (waitlistKinds as readonly string[]).includes(value);
}

/** A valid campaign tag, normalized by 028's schema, or undefined. */
export function landingUtmSource(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const parsed = waitlistJoinSchema.shape.utmSource.safeParse(raw.slice(0, EXTRA_MAX));
  return parsed.success ? parsed.data : undefined;
}

function messageFor(
  path: PropertyKey | undefined,
  copy: LandingCopy,
): [LandingField, string] | null {
  switch (path) {
    case 'email':
      return ['email', copy.errors.email];
    case 'kind':
      return ['kind', copy.errors.kind];
    case 'note':
      return ['note', copy.errors.noteTooLong];
    default:
      return null;
  }
}

/**
 * D228: the landing form's urlencoded body → 028's `WaitlistJoinRequest` fields. `utm_source`
 * becomes `utmSource` (dropped when malformed), a blank note is omitted, unknown fields are
 * ignored. Validation is 028's schema; each failing field gets one message from the copy.
 */
export function parseLandingForm(
  body: FormBody,
  copy: LandingCopy = LANDING_COPY_EN,
): LandingFormResult {
  const kind = field(body, 'kind');
  const values: LandingFormValues = {
    email: field(body, 'email'),
    kind: isKind(kind) ? kind : undefined,
    note: field(body, 'note'),
    utmSource: landingUtmSource(field(body, 'utm_source')),
  };

  const parsed = waitlistJoinSchema.safeParse({
    email: values.email,
    kind,
    note: values.note,
    utmSource: values.utmSource,
    website: field(body, 'website').slice(0, EXTRA_MAX),
  });
  if (parsed.success) return { ok: true, input: parsed.data, values };

  const errors: LandingFormErrors = {};
  for (const issue of parsed.error.issues) {
    const entry = messageFor(issue.path[0], copy);
    if (entry && !errors[entry[0]]) errors[entry[0]] = entry[1];
  }
  // Every field the schema checks maps to a message; anything else is a programming error.
  if (Object.keys(errors).length === 0) {
    throw new Error('landing form failed validation on a field with no message');
  }
  return { ok: false, values, errors };
}
