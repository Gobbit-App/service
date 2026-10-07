/** Escapes HTML special characters to prevent XSS attacks. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Share page metadata for HTML generation. */
export type ShareMeta = {
  title: string;
  description: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  canonicalUrl: string;
  redirectPath: string;
  locale: string;
  lang: string;
};

/** Renders an HTML share page with meta tags for crawlers and redirect for humans. */
export function renderSharePage(meta: ShareMeta): string {
  const esc = escapeHtml;
  const lines: string[] = [
    '<!doctype html>',
    `<html lang="${esc(meta.lang)}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<title>${esc(meta.title)}</title>`,
    '<meta name="robots" content="noindex">',
    `<meta name="description" content="${esc(meta.description)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Gobbit">',
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${esc(meta.canonicalUrl)}">`,
    `<meta property="og:image" content="${esc(meta.imageUrl)}">`,
    `<meta property="og:image:width" content="${meta.imageWidth}">`,
    `<meta property="og:image:height" content="${meta.imageHeight}">`,
    `<meta property="og:locale" content="${esc(meta.locale)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    `<meta name="twitter:description" content="${esc(meta.description)}">`,
    `<meta name="twitter:image" content="${esc(meta.imageUrl)}">`,
    `<link rel="canonical" href="${esc(meta.canonicalUrl)}">`,
    `<meta http-equiv="refresh" content="0;url=${esc(meta.redirectPath)}">`,
    '</head>',
    '<body>',
    `<p><a href="${esc(meta.redirectPath)}">Open in Gobbit</a></p>`,
    '</body>',
    '</html>',
  ];
  return lines.join('\n');
}

/** Default title for private share pages. */
export const PRIVATE_SHARE_TITLE = 'A card was shared with you';

/** Default description for private share pages. */
export const PRIVATE_SHARE_DESCRIPTION = 'Open it in Gobbit';
