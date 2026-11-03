import { remarkNormalizeStyles, remarkUnwrapStyles } from '@gobbit/shared/rich-text';
import type { Nodes, Root } from 'mdast';
import type { TextDirective } from 'mdast-util-directive';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

/**
 * D288: card bodies as words only (previews, excerpts, OG text, language detection) and as
 * Markdown without style directives (model prompts, agent output). Both read the body with the
 * same grammar as the renderers, so a directive is never mistaken for text or vice versa.
 */

const plainProcessor = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkNormalizeStyles)
  .use(remarkUnwrapStyles)
  .freeze();

const directiveParser = unified().use(remarkParse).use(remarkDirective).freeze();

/** Blocks whose text is separated from its neighbours by a space. */
const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'tableCell']);

/** GFM is not in the grammar; its table/strikethrough markers are still dropped from previews. */
function cleanText(value: string): string {
  return value.replace(/^\|[\s\-:|]*\|$/gm, '').replace(/\|/g, ' ');
}

function collect(node: Nodes, out: string[]): void {
  switch (node.type) {
    case 'text':
      out.push(cleanText(node.value));
      return;
    case 'inlineCode':
      out.push(node.value);
      return;
    case 'code':
      out.push(' ', node.value, ' ');
      return;
    case 'break':
      out.push(' ');
      return;
    case 'image':
      out.push(node.alt ?? '');
      return;
    case 'html':
    case 'thematicBreak':
      return;
  }
  if (!('children' in node)) return;
  const block = BLOCKS.has(node.type);
  if (block) out.push(' ');
  for (const child of node.children) collect(child as Nodes, out);
  if (block) out.push(' ');
}

/** Body → plain words: blocks and breaks become spaces, every Markdown/directive marker goes. */
export function toPlainText(body: string): string {
  const tree = plainProcessor.runSync(plainProcessor.parse(body), body) as Root;
  const out: string[] = [];
  collect(tree, out);
  return out
    .join('')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

type Range = [start: number, end: number];

/** The marker ranges of every labelled text directive (`:name[` … `]{…}`), outermost first. */
function markerRanges(body: string, node: Nodes, out: Range[]): void {
  if (node.type === 'textDirective') {
    const range = labelledMarkers(body, node);
    if (range) out.push(...range);
  }
  if ('children' in node)
    for (const child of node.children) markerRanges(body, child as Nodes, out);
}

function labelledMarkers(body: string, node: TextDirective): Range[] | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return null;
  // Label-less (`Re:Plan`) is prose, not a directive: keep it.
  if (!body.startsWith(`:${node.name}[`, start)) return null;
  const first = node.children[0]?.position?.start.offset;
  const last = node.children.at(-1)?.position?.end.offset;
  if (first === undefined || last === undefined) return [[start, end]];
  return [
    [start, first],
    [last, end],
  ];
}

/**
 * Body with every labelled text directive replaced by its label, all other source byte-for-byte.
 * Model prompts read words, not styling; agent proposals may not carry styles (FR-017, D288).
 */
export function stripStyleDirectives(body: string): string {
  if (!body.includes(':')) return body;
  const ranges: Range[] = [];
  markerRanges(body, directiveParser.parse(body), ranges);
  if (ranges.length === 0) return body;
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    out += body.slice(cursor, start);
    cursor = Math.max(cursor, end);
  }
  return out + body.slice(cursor);
}
