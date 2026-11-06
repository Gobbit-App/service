import { parseHTML } from 'linkedom';
import { LINK_IMAGE_CANDIDATES_MAX, LINK_PREVIEW_IMAGE_URL_MAX } from '@gobbit/shared';
import type { ImageSource } from './preview-events';

export interface ImageCandidate {
  url: string;
  source: ImageSource;
}

export interface CollectImageOptions {
  /** Readability's article content (HTML), for the in-article image rule. */
  articleHtml?: string | null;
  /** Smallest stated width of an in-article image (`LINK_ARTICLE_IMAGE_MIN_PX`). */
  articleMinPx: number;
}

/** A JSON-LD script larger than this is skipped unread. */
const STRUCTURED_DATA_MAX_CHARS = 100_000;

/** Names that mark an image as decoration rather than content. */
const DECORATION = /icon|logo|avatar|emoji|sprite|spacer|pixel|badge|gravatar|tracking/i;

/** Resolves against the page; only absolute http(s) URLs under the preview URL cap are kept. */
export function resolveImageUrl(value: string | null | undefined, base: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.length <= LINK_PREVIEW_IMAGE_URL_MAX ? url.href : null;
  } catch {
    return null;
  }
}

function attrs(doc: ParentNode, selector: string, attr: string): string[] {
  return Array.from(doc.querySelectorAll(selector))
    .map((el) => el.getAttribute(attr))
    .filter((v): v is string => Boolean(v?.trim()));
}

/** `image` or `thumbnailUrl` as a string, `{ url }`, or an array of these. */
function structuredImages(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(structuredImages);
  if (value && typeof value === 'object') {
    const url = (value as { url?: unknown }).url;
    return typeof url === 'string' ? [url] : [];
  }
  return [];
}

function structuredNodes(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.flatMap(structuredNodes);
  if (!data || typeof data !== 'object') return [];
  const node = data as Record<string, unknown>;
  const graph = Array.isArray(node['@graph']) ? structuredNodes(node['@graph']) : [];
  return [node, ...graph];
}

function structuredData(doc: ParentNode): string[] {
  const urls: string[] = [];
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    const text = script.textContent ?? '';
    if (text.length > STRUCTURED_DATA_MAX_CHARS) continue;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    for (const node of structuredNodes(data)) {
      urls.push(...structuredImages(node.image), ...structuredImages(node.thumbnailUrl));
    }
  }
  return urls;
}

function plainInt(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

/** The `srcset` entry with the largest `w` descriptor, if any entry has one. */
function widestSrcset(srcset: string | null): { url: string; width: number } | null {
  let best: { url: string; width: number } | null = null;
  for (const entry of (srcset ?? '').split(',')) {
    const [url, descriptor] = entry.trim().split(/\s+/);
    const m = /^(\d+)w$/.exec(descriptor ?? '');
    if (!url || !m) continue;
    const width = Number(m[1]);
    if (!best || width > best.width) best = { url, width };
  }
  return best;
}

function fileName(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop() ?? '';
  } catch {
    return '';
  }
}

/**
 * D344 (FR-011): the widest in-article image that states its size, is at least `minPx` wide,
 * at least half that tall when a height is stated, and isn't named like decoration.
 */
function articleImage(articleHtml: string, base: string, minPx: number): string | null {
  let doc: ParentNode;
  try {
    doc = parseHTML(`<!doctype html><html><body>${articleHtml}</body></html>`)
      .document as unknown as Document;
  } catch {
    return null;
  }
  let best: { url: string; width: number } | null = null;
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const widthAttr = plainInt(img.getAttribute('width'));
    const heightAttr = plainInt(img.getAttribute('height'));
    const fromSrcset = widestSrcset(img.getAttribute('srcset'));
    const width = fromSrcset?.width ?? widthAttr;
    if (!width || width < minPx) continue;
    if (heightAttr !== null) {
      const height =
        fromSrcset && widthAttr ? (heightAttr * fromSrcset.width) / widthAttr : heightAttr;
      if (height < minPx / 2) continue;
    }
    const url = resolveImageUrl(fromSrcset?.url ?? img.getAttribute('src'), base);
    if (!url) continue;
    const names = [img.getAttribute('class'), img.id, img.getAttribute('alt'), fileName(url)];
    if (names.some((n) => n && DECORATION.test(n))) continue;
    if (!best || width > best.width) best = { url, width };
  }
  return best?.url ?? null;
}

/**
 * D344: the page's image candidates in FR-010 order, resolved against `pageUrl`, deduplicated
 * (first source wins) and capped at `LINK_IMAGE_CANDIDATES_MAX`. Never throws.
 */
export function collectImageCandidates(
  doc: ParentNode,
  pageUrl: string,
  opts: CollectImageOptions,
): ImageCandidate[] {
  const out: ImageCandidate[] = [];
  const seen = new Set<string>();
  const add = (values: (string | null)[], source: ImageSource) => {
    for (const value of values) {
      if (out.length >= LINK_IMAGE_CANDIDATES_MAX) return;
      const url = resolveImageUrl(value, pageUrl);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, source });
    }
  };

  try {
    add(
      attrs(
        doc,
        'meta[property="og:image"], meta[name="og:image"], meta[property="og:image:url"], meta[name="og:image:url"]',
        'content',
      ),
      'og',
    );
    add(
      attrs(
        doc,
        'meta[property="og:image:secure_url"], meta[name="og:image:secure_url"]',
        'content',
      ),
      'og_secure',
    );
    add(
      attrs(
        doc,
        'meta[name="twitter:image"], meta[property="twitter:image"], meta[name="twitter:image:src"], meta[property="twitter:image:src"]',
        'content',
      ),
      'twitter',
    );
    add(structuredData(doc), 'structured_data');
    add(attrs(doc, 'link[rel="image_src"]', 'href'), 'image_src');
    add(attrs(doc, 'video[poster]', 'poster'), 'video_poster');
    if (opts.articleHtml) {
      add([articleImage(opts.articleHtml, pageUrl, opts.articleMinPx)], 'article');
    }
  } catch {
    // A malformed document gives whatever was collected so far.
  }
  return out;
}
