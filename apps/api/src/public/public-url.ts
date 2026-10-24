/** What a public page links to: the deck itself, one category or one card. */
export type PageTarget =
  | { kind: 'deck'; slug: string }
  | { kind: 'category'; slug: string; category: string }
  | { kind: 'item'; slug: string; itemId: string };

const enc = encodeURIComponent;

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
  }
}

/** D178: "Open in app" signs the visitor in, then lands on the matching app route. */
export function openInAppPath(target: PageTarget): string {
  return `/sign-in?next=${enc(appPath(target))}`;
}
