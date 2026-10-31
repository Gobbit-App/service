/**
 * D244: what analytics may know about a page — a route pattern (placeholders, never real values,
 * no query, no fragment) and a fixed screen name (never deck, card or category text).
 */
export type Screen = { pattern: string; name: string };

/** D244: sent for a route that is missing from the catalogue (should not happen; `tsc` checks it). */
export const OTHER_SCREEN: Screen = { pattern: '/other', name: 'Other' };

/** D249: the API-rendered pages that carry the tracker; each renderer passes its own entry. */
export const PUBLIC_SCREENS = {
  deck: { pattern: '/p/:deck', name: 'Public deck' },
  category: { pattern: '/p/:deck/c/:category', name: 'Public category' },
  item: { pattern: '/p/:deck/i/:item', name: 'Public card' },
  search: { pattern: '/p/:deck/search', name: 'Public search' },
  share: { pattern: '/s/:item', name: 'Share preview' },
} as const satisfies Record<string, Screen>;

export type PublicScreenKey = keyof typeof PUBLIC_SCREENS;
