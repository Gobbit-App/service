import { analyticsTag, type AnalyticsHead } from './analytics';
import { h, raw, type Html } from './html';
import { PUBLIC_PAGE_CSS } from './styles';

/** D177: everything the `<head>` of a public page needs. */
export type PageHead = {
  title: string;
  description: string;
  /** Absolute canonical URL; also og:url. Absent on error pages. */
  canonical?: string;
  /** Absolute image URL for og:image / twitter:image. */
  image?: string;
  /** og:image:width / og:image:height, for static images of a known size (030). */
  imageSize?: { width: number; height: number };
  ogType: 'website' | 'article';
  locale: string;
  lang: string;
  dir: 'ltr' | 'rtl';
  /** D179: shared decks and error pages are `noindex`. */
  robots: 'index' | 'noindex';
  /** D232: Umami's tracker; only the landing page sets it, and only when configured (031). */
  analytics?: AnalyticsHead;
};

/** Site name in og:site_name and the page header. */
export const SITE_NAME = 'Gobbit';

/** Page-specific additions to the shell (030's landing page). */
export type LayoutOptions = {
  /** Appended to `PUBLIC_PAGE_CSS`; trusted constant CSS only. */
  css?: string;
  /** A link on the end side of the site header, built with `h`. */
  headerLink?: Html;
};

/**
 * D177: the HTML shell. One inline stylesheet, no script (except D232's optional tracker on the
 * landing page), every value escaped by `h`.
 * `main` is pre-rendered markup built with `h`.
 */
export function layout(head: PageHead, main: Html, opts: LayoutOptions = {}): string {
  return h`<!doctype html>
<html lang="${head.lang}" dir="${head.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${head.title}</title>
<meta name="description" content="${head.description}">
${head.canonical ? h`<link rel="canonical" href="${head.canonical}">` : ''}
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:type" content="${head.ogType}">
<meta property="og:title" content="${head.title}">
<meta property="og:description" content="${head.description}">
${head.canonical ? h`<meta property="og:url" content="${head.canonical}">` : ''}
${head.image ? h`<meta property="og:image" content="${head.image}">` : ''}
${
  head.image && head.imageSize
    ? h`<meta property="og:image:width" content="${head.imageSize.width}">
<meta property="og:image:height" content="${head.imageSize.height}">`
    : ''
}
<meta property="og:locale" content="${head.locale}">
<meta name="twitter:card" content="${head.image ? 'summary_large_image' : 'summary'}">
${head.robots === 'noindex' ? h`<meta name="robots" content="noindex">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${raw(PUBLIC_PAGE_CSS)}${raw(opts.css ?? '')}</style>
${head.analytics ? analyticsTag(head.analytics) : ''}
</head>
<body>
<main>
<header class="site"><a class="brand" href="/">${SITE_NAME}</a>${opts.headerLink ?? ''}</header>
${main}
</main>
</body>
</html>
`.toString();
}
