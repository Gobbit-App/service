import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { PAGE_TEXT_MAX, type OpenGraph } from '@gobbit/shared';

/** Structured data extracted from a fetched HTML page. */
export interface ExtractedPage {
  title: string | null;
  text: string;
  og: OpenGraph;
  lang: string | null;
}

type ParsedDocument = ReturnType<typeof parseHTML>['document'];

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readMeta(document: ParsedDocument, prop: string): string | null {
  const content = document
    .querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)
    ?.getAttribute('content');
  return nonEmpty(content);
}

function resolveHttpUrl(value: string | null, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function readableText(html: string): string {
  try {
    // Readability mutates the DOM, so it gets its own parse.
    const doc = parseHTML(html).document as unknown as Document;
    return new Readability(doc).parse()?.textContent ?? '';
  } catch {
    return '';
  }
}

/**
 * Collapses whitespace: runs of spaces become one space per line, lines are trimmed,
 * 3+ newlines collapse to a blank line, and the result is trimmed.
 */
export function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts Open Graph metadata, title, language and readable text from HTML.
 * Never throws; returns empty values on failure.
 */
export function extractPage(html: string, pageUrl: string): ExtractedPage {
  try {
    const { document } = parseHTML(html);

    const og: OpenGraph = {
      title: readMeta(document, 'og:title'),
      description: readMeta(document, 'og:description'),
      image: resolveHttpUrl(readMeta(document, 'og:image'), pageUrl),
      siteName: readMeta(document, 'og:site_name'),
    };

    const docTitle = nonEmpty(document.querySelector('title')?.textContent);
    const title = og.title ?? docTitle;

    const lang = nonEmpty(document.documentElement?.getAttribute('lang'));

    const text = collapseWhitespace(readableText(html)).slice(0, PAGE_TEXT_MAX);

    return { title, text, og, lang };
  } catch {
    return {
      title: null,
      text: '',
      og: { title: null, description: null, image: null, siteName: null },
      lang: null,
    };
  }
}
