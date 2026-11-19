import type { ImportParseResult, ImportRow } from './constants';
import { withError } from './note-row';
import { plain } from './parse-markdown';

const FENCE = /^\s{0,3}(```|~~~)/;
/** Exactly one or two `#` (ATX); `###` and deeper stay body text. */
const HEADING = /^ {0,3}(#{1,2})[ \t]+(.*?)[ \t]*#*[ \t]*$/;

/** True when a `##` heading sits outside a code fence: the cue for section parsing (D443). */
export function hasSectionHeading(text: string): boolean {
  let inFence = false;
  for (const raw of text.split(/\r?\n/)) {
    if (FENCE.test(raw)) inFence = !inFence;
    else if (!inFence && /^ {0,3}##[ \t]+/.test(raw)) return true;
  }
  return false;
}

/** D443: `#` sets the category, each `##` opens a card whose body is the raw text up to the next heading. */
export function parseSections(text: string): ImportParseResult {
  const rows: ImportRow[] = [];
  const ignored: ImportParseResult['ignored'] = [];
  let category: string | null = null;
  let card: { line: number; title: string; category: string | null; body: string[] } | null = null;
  let inFence = false;

  const close = (): void => {
    if (!card) return;
    const body = card.body.join('\n').replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, '');
    rows.push(
      withError({
        line: card.line,
        type: 'text',
        title: card.title,
        body: body.trim() === '' ? '' : body,
        sourceUrl: null,
        categories: card.category ? [card.category] : [],
      }),
    );
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
        card = { line, title: name, category, body: [] };
        // T024: field lines directly under the `##` line are read here.
      }
    } else if (card) card.body.push(raw);
    else if (raw.trim() !== '') ignored.push({ line, text: raw.trim() });
  });
  close();
  return { rows, problem: null, ignored };
}
