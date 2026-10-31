import {
  INGEST_IMAGE_MIMES,
  INGEST_MAX_IMAGES,
  INGEST_TEXT_MAX,
  INGEST_TITLE_MAX,
} from '@gobbit/shared';

/** Inbound email as delivered by the mail webhook. */
export interface InboundEmail {
  to: string[];
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  attachments: { id: string; filename?: string | null; contentType: string; size: number }[];
}

/** Result of mapping an inbound email onto ingest fields. */
export interface MappedEmail {
  title?: string;
  text?: string;
  url?: string;
  attachmentIds: string[];
}

/**
 * Parses `Name <a@b>` or `a@b` into local and domain parts.
 * @returns null when the value contains no usable address.
 */
function parseAddress(raw: string): { local: string; domain: string } | null {
  const bracket = /<([^>]*)>/.exec(raw);
  const addr = (bracket ? (bracket[1] ?? '') : raw).trim();
  const at = addr.lastIndexOf('@');
  if (at <= 0 || at === addr.length - 1) return null;
  return { local: addr.slice(0, at), domain: addr.slice(at + 1) };
}

/** Cuts a string to at most `max` Unicode code points. */
function cutCodePoints(s: string, max: number): string {
  const cps = Array.from(s);
  return cps.length <= max ? s : cps.slice(0, max).join('');
}

/** Strips repeated leading `Re:` / `Fwd:` / `Fw:` prefixes. */
function stripReplyPrefixes(subject: string): string {
  let s = subject.trim();
  for (;;) {
    const next = s.replace(/^(?:re|fwd|fw)\s*:\s*/i, '').trim();
    if (next === s) return s;
    s = next;
  }
}

/** True when a content type (params allowed) is one of the ingestible image MIME types. */
function isImageMime(contentType: string): boolean {
  const mime = (contentType.split(';')[0] ?? '').trim().toLowerCase();
  return (INGEST_IMAGE_MIMES as readonly string[]).includes(mime);
}

/**
 * Returns the local part of the first recipient whose domain equals `domain`.
 * @returns the local part as written, or null when no recipient matches.
 */
export function tokenLocalPart(to: readonly string[], domain: string): string | null {
  const want = domain.toLowerCase();
  for (const entry of to) {
    const parsed = parseAddress(entry);
    if (parsed && parsed.domain.toLowerCase() === want) return parsed.local;
  }
  return null;
}

const QUOTE_CUTS: readonly RegExp[] = [
  /^On .+wrote:\s*$/,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^>/,
];

/**
 * Removes quoted reply history and trailing signatures from an email body.
 * @returns the retained text, trimmed at the end.
 */
export function trimQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line === '-- ') {
      end = i;
      break;
    }
    const isFromHeader = /^From: .+/.test(line) && i > 0 && (lines[i - 1] ?? '').trim() === '';
    if (isFromHeader || QUOTE_CUTS.some((re) => re.test(line))) {
      end = i;
      break;
    }
  }
  return lines.slice(0, end).join('\n').trimEnd();
}

/**
 * Finds the first http(s) URL in text, stripping trailing punctuation.
 * @returns the cleaned URL, or null when none is present.
 */
export function firstUrl(text: string): string | null {
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/gi)) {
    const cleaned = (m[0] ?? '').replace(/[).,;:!?'"]+$/, '');
    if (/^https?:\/\/\S/i.test(cleaned)) return cleaned;
  }
  return null;
}

/**
 * Converts HTML to plain text: drops script/style blocks and tags, decodes common entities,
 * and collapses whitespace.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maps an inbound email to ingest fields: title from subject, text from body, first URL,
 * and image attachment ids.
 */
export function mapInboundEmail(email: InboundEmail): MappedEmail {
  const subject = stripReplyPrefixes(email.subject ?? '');
  const title = cutCodePoints(subject, INGEST_TITLE_MAX);

  const raw = email.text ?? stripHtml(email.html ?? '');
  const body = cutCodePoints(trimQuotedReply(raw).trim(), INGEST_TEXT_MAX);

  const url = firstUrl(body) ?? firstUrl(subject);

  const attachmentIds = email.attachments
    .filter((a) => isImageMime(a.contentType))
    .slice(0, INGEST_MAX_IMAGES)
    .map((a) => a.id);

  const out: MappedEmail = { attachmentIds };
  if (title) out.title = title;
  if (body) out.text = body;
  if (url) out.url = url;
  return out;
}
