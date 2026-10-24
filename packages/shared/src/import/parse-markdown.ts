import type { ImportRow } from './constants';
import { LIST_MARKER } from './parse-lines';
import { noteRow, titleForUrl, withError } from './note-row';

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const IMAGE_ONLY = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
const LINK_ONLY = /^\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/;
const INLINE_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const EMPHASIS = /(\*\*|__|`)/g;
const TASK_BOX = /^\[[ xX]\]\s+/;
const QUOTE = /^\s*>\s?/;

/** Inline Markdown → plain text; the first link's URL is returned for `sourceUrl`. */
function plain(text: string): { text: string; url: string | null } {
  let url: string | null = null;
  const replaced = text.replace(INLINE_LINK, (_m, label: string, href: string) => {
    url ??= href;
    return label;
  });
  return { text: replaced.replace(EMPHASIS, ''), url };
}

/**
 * D189 Markdown: `#` headings set the category, list items and paragraphs become cards (line
 * rules); rules, code blocks and images are skipped.
 */
export function parseMarkdown(text: string): ImportRow[] {
  const rows: ImportRow[] = [];
  let category: string | null = null;
  let inFence = false;
  let paragraph: { line: number; parts: string[] } | null = null;

  const push = (raw: string, line: number): void => {
    const link = LINK_ONLY.exec(raw);
    if (link?.[1] && link[2]) {
      rows.push(
        withError({
          line,
          type: 'link',
          title: link[1].trim() || titleForUrl(link[2]),
          body: '',
          sourceUrl: link[2],
          category,
        }),
      );
      return;
    }
    const { text: note, url } = plain(raw);
    const row = noteRow(note, { line, category, url });
    if (row) rows.push(row);
  };
  const flush = (): void => {
    if (paragraph) push(paragraph.parts.join(' '), paragraph.line);
    paragraph = null;
  };

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (FENCE.test(raw)) {
      flush();
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const heading = HEADING.exec(raw);
    if (heading) {
      flush();
      category = plain(heading[1] ?? '').text.trim() || null;
      return;
    }
    if (raw.trim() === '' || RULE.test(raw) || IMAGE_ONLY.test(raw)) {
      flush();
      return;
    }
    const content = raw.replace(QUOTE, '');
    if (LIST_MARKER.test(content)) {
      flush();
      push(content.replace(LIST_MARKER, '').replace(TASK_BOX, ''), line);
      return;
    }
    if (paragraph) paragraph.parts.push(content.trim());
    else paragraph = { line, parts: [content.trim()] };
  });
  flush();
  return rows;
}
