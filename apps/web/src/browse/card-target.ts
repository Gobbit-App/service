/**
 * D328: card targets set by a category settle or jump, kept until the address (`c`) catches up
 * with `to`. The track changes category before the router updates the address, so in between
 * the address still names the category being left and its `i`.
 */
export interface PendingTargets {
  /** The category the reader is moving to. */
  to: string;
  /** The card each listed category opens on; `undefined` = its first card. */
  cards: Readonly<Record<string, string | undefined>>;
}

/**
 * The card a category's stack opens on. Normally the address's `i` for the address's category
 * and the first card elsewhere. While a move is pending, its targets win: the category being
 * left remounts on its first card, not on the stale `i` it is about to drop.
 */
export function cardTarget(
  slug: string,
  address: { c: string; i: string | undefined },
  pending: PendingTargets | null,
): string | undefined {
  if (pending && pending.to !== address.c && Object.hasOwn(pending.cards, slug)) {
    return pending.cards[slug];
  }
  return slug === address.c ? address.i : undefined;
}
