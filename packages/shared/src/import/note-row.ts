import { IMPORT_TITLE_SPLIT_MAX } from '../ingest/constants';
import { CARD_BODY_MAX, CARD_TITLE_MAX, NAME_MAX } from '../limits';
import { codePointLength } from '../utils/utf8-bytes';
import type { ImportRow } from './constants';

const URL_PATTERN = /https?:\/\/[^\s<>"]+/i;
/** Trailing characters that end a sentence around a URL rather than belong to it. */
const URL_TRAILING = /[.,;:!?)\]'"»]+$/;
/** `title — body`, `title – body`, `title - body` (spaced) or `title: body`; the first one wins. */
const SEPARATOR = /\s+[—–-]\s+|:\s+/u;
const SENTENCE_END = /[.?!](?=\s|$)/gu;
/** A line with no letters or digits: separators like `---`, `***`, `•••`. */
const NO_CONTENT = /^[^\p{L}\p{N}]*$/u;

const cpSlice = (s: string, n: number): string => [...s].slice(0, n).join('');

/** The first http(s) URL in a text, without trailing punctuation. */
export function findUrl(text: string): string | null {
  const match = URL_PATTERN.exec(text);
  if (!match) return null;
  const url = match[0].replace(URL_TRAILING, '');
  try {
    return new URL(url).protocol.startsWith('http') ? url : null;
  } catch {
    return null;
  }
}

/** A readable title for a bare URL: no scheme or `www.`, cut to the title limit. */
export function titleForUrl(url: string): string {
  const short = url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
  return shorten(short, CARD_TITLE_MAX);
}

/** Cuts at a word boundary and adds an ellipsis when the text is longer than `max`. */
export function shorten(text: string, max: number): string {
  if (codePointLength(text) <= max) return text;
  const cut = cpSlice(text, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A title without the URL it carries (that one becomes `sourceUrl`). */
function withoutUrl(title: string, url: string): string {
  if (!title.includes(url)) return title;
  const rest = title
    .replace(url, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;,.–—-]+|[\s:;,.–—-]+$/gu, '')
    .trim();
  return hasContent(rest) ? rest : titleForUrl(url);
}

export const hasContent = (text: string): boolean => !NO_CONTENT.test(text);

/** D189 line rules: the title/body split of one note. */
function splitNote(text: string): { title: string; body: string } {
  const sep = SEPARATOR.exec(text);
  if (sep && sep.index > 0) {
    const title = text.slice(0, sep.index).trim();
    const body = text.slice(sep.index + sep[0].length).trim();
    if (body !== '' && codePointLength(title) <= IMPORT_TITLE_SPLIT_MAX && !findUrl(title)) {
      return { title, body };
    }
  }
  for (const end of text.matchAll(SENTENCE_END)) {
    const sentence = text.slice(0, end.index + 1).trim();
    if (codePointLength(sentence) > IMPORT_TITLE_SPLIT_MAX) break;
    if (codePointLength(sentence) > 1) {
      const title = sentence.replace(/\.$/, '');
      return { title, body: sentence === text ? '' : text };
    }
  }
  if (codePointLength(text) <= IMPORT_TITLE_SPLIT_MAX) return { title: text, body: '' };
  return { title: shorten(text, IMPORT_TITLE_SPLIT_MAX), body: text };
}

/** Card limits for a parsed row; the reason, or null when the row can be imported. */
export function rowError(row: Omit<ImportRow, 'error'>): string | null {
  if (row.title.trim() === '') return 'No title';
  if (codePointLength(row.title) > CARD_TITLE_MAX) {
    return `Title is longer than ${CARD_TITLE_MAX} characters`;
  }
  const bodyLength = codePointLength(row.body);
  if (bodyLength > CARD_BODY_MAX) {
    return `Longer than ${CARD_BODY_MAX} characters (${bodyLength})`;
  }
  if (row.category && codePointLength(row.category) > NAME_MAX) {
    return `Category name is longer than ${NAME_MAX} characters`;
  }
  if (row.type === 'link' && !row.sourceUrl) return 'A link needs a URL';
  return null;
}

export function withError(row: Omit<ImportRow, 'error'>): ImportRow {
  return { ...row, error: rowError(row) };
}

export interface NoteContext {
  line: number;
  category: string | null;
  /** A URL found by the caller (e.g. a Markdown link), used when the text has none. */
  url?: string | null;
}

/** One note → a row: a bare URL is a link card, otherwise a text card split by the line rules. */
export function noteRow(raw: string, ctx: NoteContext): ImportRow | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text === '' || !hasContent(text)) return null;
  const url = findUrl(text) ?? ctx.url ?? null;
  if (url && text === url) {
    return withError({
      line: ctx.line,
      type: 'link',
      title: titleForUrl(url),
      body: '',
      sourceUrl: url,
      category: ctx.category,
    });
  }
  const split = splitNote(text);
  const title = url ? withoutUrl(split.title, url) : split.title;
  const { body } = split;
  return withError({
    line: ctx.line,
    type: 'text',
    title,
    body,
    sourceUrl: url,
    category: ctx.category,
  });
}
