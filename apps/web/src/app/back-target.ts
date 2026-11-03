import { deckHref } from '../ui/chip-order';

/** The deck list; `/` alone redirects to the last deck. */
export const DECK_LIST_HREF = '/?all=true';

/** Which screen the header sits on, with what its back target needs (D200). */
export type BackScreen =
  | { kind: 'home' }
  | { kind: 'top'; lastDeck?: string | null }
  | { kind: 'deck' }
  | { kind: 'deck-page'; deckSlug: string }
  | { kind: 'new-card'; deckSlug: string }
  | { kind: 'card'; deckSlug: string }
  | { kind: 'edit'; itemId: string; deckSlug: string; from?: 'review' };

/**
 * D200 / FR-001–FR-003: the header back target, one level up the hierarchy and never history.
 * D267: every page inside a deck (settings, review, log, a category…) goes up to the deck's
 * main page; only the main page goes up to the deck list.
 * `null` means no back control (the deck list is the top).
 */
export function backTarget(screen: Exclude<BackScreen, { kind: 'home' }>): string;
export function backTarget(screen: BackScreen): string | null;
export function backTarget(screen: BackScreen): string | null {
  switch (screen.kind) {
    case 'home':
      return null;
    case 'top':
      // D267: a page outside any deck (Settings, Share) returns to the deck you came from.
      return screen.lastDeck ? deckHref(screen.lastDeck) : DECK_LIST_HREF;
    case 'deck':
      return DECK_LIST_HREF;
    case 'deck-page':
    case 'new-card':
    case 'card':
      return deckHref(screen.deckSlug);
    case 'edit':
      return screen.from === 'review'
        ? deckHref(screen.deckSlug, 'review')
        : `/i/${encodeURIComponent(screen.itemId)}`;
  }
}
