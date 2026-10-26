import { deckHref } from '../ui/chip-order';

/** The deck list; `/` alone redirects to the last deck. */
export const DECK_LIST_HREF = '/?all=true';

/** Which screen the header sits on, with what its back target needs (D200). */
export type BackScreen =
  | { kind: 'home' }
  | { kind: 'top' }
  | { kind: 'deck' }
  | { kind: 'new-card'; deckSlug: string }
  | { kind: 'card'; deckSlug: string }
  | { kind: 'edit'; itemId: string; deckSlug: string; from?: 'review' };

/**
 * D200 / FR-001–FR-003: the header back target, one level up the hierarchy and never history.
 * `null` means no back control (the deck list is the top).
 */
export function backTarget(screen: Exclude<BackScreen, { kind: 'home' }>): string;
export function backTarget(screen: BackScreen): string | null;
export function backTarget(screen: BackScreen): string | null {
  switch (screen.kind) {
    case 'home':
      return null;
    case 'top':
    case 'deck':
      return DECK_LIST_HREF;
    case 'new-card':
    case 'card':
      return deckHref(screen.deckSlug);
    case 'edit':
      return screen.from === 'review'
        ? deckHref(screen.deckSlug, 'review')
        : `/i/${encodeURIComponent(screen.itemId)}`;
  }
}
