/** 030: the landing page, served at the root for cookieless visitors (D226, D227). */
export const LANDING_PATH = '/welcome';
/** 030: the "check your email" page after a join (its own path so 031 can count it). */
export const LANDING_JOINED_PATH = '/welcome/joined';

/** D229: the landing page's canonical URL is the root, whatever path or state served it. */
export function landingUrl(origin: string): string {
  return `${origin}/`;
}

/** What a public page links to: the deck itself, one category, one card or a search (D182). */
export type PageTarget =
  | { kind: 'deck'; slug: string }
  | { kind: 'category'; slug: string; category: string }
  | { kind: 'item'; slug: string; itemId: string }
  | { kind: 'search'; slug: string; q: string };

const enc = encodeURIComponent;

/** `?q=…`, or nothing for an empty query. */
function queryString(q: string): string {
  return q ? `?q=${enc(q)}` : '';
}

/** Path of a public page relative to the origin, e.g. `/p/our-street/c/emergency`. */
export function publicPath(target: PageTarget): string {
  const base = `/p/${enc(target.slug)}`;
  switch (target.kind) {
    case 'deck':
      return base;
    case 'category':
      return `${base}/c/${enc(target.category)}`;
    case 'item':
      return `${base}/i/${enc(target.itemId)}`;
    case 'search':
      return `${base}/search${queryString(target.q)}`;
  }
}

/**
 * D177: every absolute public URL (canonical, og:url, sitemap, share redirect) goes through
 * here, so a deck's own domain (Phase 12) changes one function. `origin` has no trailing slash.
 */
export function publicUrl(origin: string, target: PageTarget): string {
  return `${origin}${publicPath(target)}`;
}

/** D178: the PWA route a member is sent to for the same content. */
export function appPath(target: PageTarget): string {
  switch (target.kind) {
    case 'deck':
      return `/d/${enc(target.slug)}`;
    case 'category':
      return `/d/${enc(target.slug)}/c/${enc(target.category)}`;
    case 'item':
      return `/i/${enc(target.itemId)}`;
    case 'search':
      return `/d/${enc(target.slug)}/search${queryString(target.q)}`;
  }
}

/** D178: "Open in app" signs the visitor in, then lands on the matching app route. */
export function openInAppPath(target: PageTarget): string {
  return `/sign-in?next=${enc(appPath(target))}`;
}
