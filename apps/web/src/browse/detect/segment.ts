import LinkifyIt, { type Match } from 'linkify-it';

/** What a piece of card text was recognised as (data-model §5). */
export type DetectKind = 'email' | 'phone' | 'url' | 'number';

export type Segment =
  | { kind: 'text'; text: string }
  | {
      kind: DetectKind;
      /** As written in the card. */
      text: string;
      /** What the action uses: the address, `+` and digits, the `http(s)` URL, the number. */
      value: string;
    };

/** Phones have 7–15 digits (E.164 allows 15). */
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;
/** Fewer digits than this are never marked (FR-026). */
const NUMBER_MIN_DIGITS = 3;

/** Web addresses and emails only: no `ftp:`, no schema-relative `//host`. */
const linkify = new LinkifyIt().add('ftp:', null).add('//', null);

/**
 * A digit run with the separators phones and long numbers are written with: single spaces,
 * dashes, dots, brackets, and thousands commas. It never starts or ends on a separator.
 */
const DIGIT_RUN =
  /(?:\+[ \u00a0]?)?(?:\(\d+\)|\d+)(?:[ \u00a0.-]?\(\d+\)|[ \u00a0.-]?\d+|,(?=\d{3}(?!\d))\d+)*/g;

/** Letters (any script), digits and `_`: a run touching one is part of a word (`A4`, `2nd`). */
const WORDLIKE = /[\p{L}\p{N}_]/u;
/** A digit run next to `/` or `:` and another digit is a date or time (`12/05`, `10:30`). */
const DATE_OR_TIME_JOIN = /[/:]/;
/** Dates written with dashes or dots only (`2024-05-12`, `12.05.2024`). */
const DASHED_DATE = /^(?:\d{4}[-.]\d{1,2}[-.]\d{1,2}|\d{1,2}[-.]\d{1,2}[-.](?:\d{2}|\d{4}))$/;
/** A stand-alone year in running text (`since 2019`). */
const YEAR = /^(?:19|20)\d{2}$/;

const digitsOf = (text: string) => text.replace(/\D/g, '');

/** True when `text[at]` joins the run to a neighbouring date or time part. */
function joinsDateOrTime(text: string, at: number, step: 1 | -1): boolean {
  return DATE_OR_TIME_JOIN.test(text[at] ?? '') && /\d/.test(text[at + step] ?? '');
}

/** D339: a digit run in context → a phone, a number to copy, or nothing. */
function classifyDigits(
  text: string,
  start: number,
  end: number,
): { kind: 'phone' | 'number'; value: string } | null {
  const run = text.slice(start, end);
  if (WORDLIKE.test(text[start - 1] ?? '') || WORDLIKE.test(text[end] ?? '')) return null;
  if (joinsDateOrTime(text, start - 1, -1) || joinsDateOrTime(text, end, 1)) return null;
  if (DASHED_DATE.test(run) || YEAR.test(run)) return null;
  const digits = digitsOf(run);
  if (digits.length < NUMBER_MIN_DIGITS) return null;
  const international = run.startsWith('+');
  // Spaces, dashes or brackets read as phone formatting; a lone dot reads as a decimal.
  const formatted = /[ \u00a0()-]/.test(run) || (run.match(/\./g)?.length ?? 0) >= 2;
  const phoneLength = digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
  if (phoneLength && !run.includes(',') && (international || formatted)) {
    return { kind: 'phone', value: international ? `+${digits}` : digits };
  }
  // When unsure, copy: copying is harmless and dialling is not (spec edge cases).
  return { kind: 'number', value: run };
}

/** Phones and numbers in text that has no web address or email in it. */
function segmentDigits(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(DIGIT_RUN)) {
    const start = match.index;
    const end = start + match[0].length;
    const found = classifyDigits(text, start, end);
    if (!found) continue;
    if (start > last) segments.push({ kind: 'text', text: text.slice(last, start) });
    segments.push({ kind: found.kind, text: match[0], value: found.value });
    last = end;
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) });
  return segments;
}

/** An `http(s)` web address or an email from a linkify match; anything else stays text. */
function linkSegment(match: Match): Segment {
  if (match.schema === 'mailto:' || match.url.startsWith('mailto:')) {
    const address = match.url.replace(/^mailto:/i, '');
    return { kind: 'email', text: match.raw, value: address };
  }
  if (/^https?:\/\//i.test(match.url)) return { kind: 'url', text: match.raw, value: match.url };
  return { kind: 'text', text: match.raw };
}

/** Joins neighbouring text segments, so callers render as few nodes as possible. */
function merge(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    if (segment.kind === 'text' && previous?.kind === 'text') {
      merged[merged.length - 1] = { kind: 'text', text: previous.text + segment.text };
    } else if (segment.text !== '') {
      merged.push(segment);
    }
  }
  return merged;
}

/**
 * D339/FR-024–FR-026: splits plain text into text and detected segments. Web addresses and
 * emails come from linkify-it; phones and numbers from the digit rules above. Render-only: the
 * card's stored text is never changed.
 */
export function segmentText(text: string): Segment[] {
  if (!/[\d@.]/.test(text)) return text === '' ? [] : [{ kind: 'text', text }];
  const segments: Segment[] = [];
  let last = 0;
  for (const match of linkify.match(text) ?? []) {
    segments.push(...segmentDigits(text.slice(last, match.index)), linkSegment(match));
    last = match.lastIndex;
  }
  segments.push(...segmentDigits(text.slice(last)));
  return merge(segments);
}
