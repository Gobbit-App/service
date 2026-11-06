import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { LINK_ARTICLE_IMAGE_MIN_PX, PAGE_TEXT_MAX, type OpenGraph } from '@gobbit/shared';
import { collectImageCandidates, type ImageCandidate } from './page-images';

/** Structured data extracted from a fetched HTML page. */
export interface ExtractedPage {
  title: string | null;
  text: string;
  og: OpenGraph;
  lang: string | null;
  /** D344: ordered preview image candidates; `og.image` stays for callers that read it. */
  images: ImageCandidate[];
}

export interface ExtractOptions {
  /** D344: smallest stated width of an in-article image. */
  articleMinPx?: number;
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

/** Readability's text and article HTML, from one parse (the text and D344's article images). */
function readable(html: string): { text: string; articleHtml: string | null } {
  try {
    // Readability mutates the DOM, so it gets its own parse.
    const doc = parseHTML(html).document as unknown as Document;
    const article = new Readability(doc).parse();
    return { text: article?.textContent ?? '', articleHtml: article?.content ?? null };
  } catch {
    return { text: '', articleHtml: null };
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
export function extractPage(
  html: string,
  pageUrl: string,
  opts: ExtractOptions = {},
): ExtractedPage {
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

    const article = readable(html);
    const text = collapseWhitespace(article.text).slice(0, PAGE_TEXT_MAX);
    const images = collectImageCandidates(document as unknown as Document, pageUrl, {
      articleHtml: article.articleHtml,
      articleMinPx: opts.articleMinPx ?? LINK_ARTICLE_IMAGE_MIN_PX,
    });

    return { title, text, og, lang, images };
  } catch {
    return {
      title: null,
      text: '',
      og: { title: null, description: null, image: null, siteName: null },
      lang: null,
      images: [],
    };
  }
}
