import type { ImportParseResult, ImportRow } from './constants';
import { withError } from './note-row';
import { plain } from './parse-markdown';
import { normalise } from './to-draft';

const FENCE = /^\s{0,3}(```|~~~)/;
/** Exactly one or two `#` (ATX); `###` and deeper stay body text. */
const FIELD = /^([A-Za-z][A-Za-z-]*):[ \t]+(.*)$/;
const HEADING = /^ {0,3}(#{1,2})[ \t]+(.*?)[ \t]*#*[ \t]*$/;

/** D443: `#` sets the category, each `##` opens a card whose body is the raw text up to the next heading. */
export function parseSections(text: string): ImportParseResult {
  const rows: ImportRow[] = [];
  const ignored: ImportParseResult['ignored'] = [];
  let category: string | null = null;
  let card: {
    line: number;
    title: string;
    categories: string[];
    body: string[];
    fields: boolean;
    seen: Set<string>;
    type: 'text' | 'link';
    sourceUrl: string | null;
    error: string | null;
  } | null = null;

  /** D444: one field line; the first problem on the card wins. */
  const field = (c: NonNullable<typeof card>, key: string, value: string, line: number): void => {
    const fail = (why: string): void => {
      c.error ??= `Line ${line}: ${key}: ${why}`;
    };
    if (c.seen.has(key)) return fail('repeated');
    c.seen.add(key);
    if (value === '') return fail('empty value');
    if (key === 'cover' || key === 'image' || (key === 'type' && value.toLowerCase() === 'media')) {
      return fail('media is not supported yet');
    }
    if (key === 'source') {
      const ok = /^https?:\/\//i.test(value) && URL.canParse(value);
      if (ok) c.sourceUrl = value;
      else fail('not an http(s) address');
    } else if (key === 'type') {
      const t = value.toLowerCase();
      if (t === 'text' || t === 'link') c.type = t;
      else fail('must be text or link');
    } else if (key === 'categories') {
      for (const name of value.split(/[,،，]/).map((n) => n.trim())) {
        if (name && !c.categories.some((x) => normalise(x) === normalise(name))) {
          c.categories.push(name);
        }
      }
    } else fail('unknown field');
  };
  let inFence = false;

  const close = (): void => {
    if (!card) return;
    const body = card.body.join('\n').replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, '');
    const row = withError({
      line: card.line,
      type: card.type,
      title: card.title,
      body: body.trim() === '' ? '' : body,
      sourceUrl: card.sourceUrl,
      categories: card.categories,
    });
    const missing = card.type === 'link' && !card.sourceUrl ? 'type: link needs a source' : null;
    rows.push({
      ...row,
      error: card.error ?? (missing && `Line ${card.line}: ${missing}`) ?? row.error,
    });
    card = null;
  };

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const fence = FENCE.test(raw);
    if (fence) inFence = !inFence;
    const heading = inFence || fence ? null : HEADING.exec(raw);
    if (heading) {
      close();
      const name = plain(heading[2] ?? '').text.trim();
      if (heading[1] === '#') category = name || null;
      else {
        card = {
          line,
          title: name,
          categories: category ? [category] : [],
          body: [],
          fields: true,
          seen: new Set(),
          type: 'text',
          sourceUrl: null,
          error: null,
        };
      }
    } else if (card) {
      const f = card.fields ? FIELD.exec(raw) : null;
      if (f) field(card, (f[1] ?? '').toLowerCase(), (f[2] ?? '').trim(), line);
      else {
        card.fields = false;
        card.body.push(raw);
      }
    } else if (raw.trim() !== '') ignored.push({ line, text: raw.trim() });
  });
  close();
  return { rows, problem: null, ignored };
}
