const TITLE_PREFIX = 'card-title-';

/** The bottom edge of the sticky chrome (chip row), above which a card counts as scrolled away. */
function chromeBottom(root: ParentNode): number {
  return root.querySelector('.chip-row')?.getBoundingClientRect().bottom ?? 0;
}

/**
 * Contract §1: Browse opens on the first card visible in the list, i.e. the first card whose
 * bottom is still below the sticky chrome. Null when the list shows no cards.
 */
export function firstVisibleItemId(
  root: ParentNode = document,
  top: number = chromeBottom(root),
): string | null {
  const cards = root.querySelectorAll<HTMLElement>('.item-list__items article.card');
  for (const card of Array.from(cards)) {
    if (card.getBoundingClientRect().bottom <= top) continue;
    const labelledBy = card.getAttribute('aria-labelledby') ?? '';
    return labelledBy.startsWith(TITLE_PREFIX) ? labelledBy.slice(TITLE_PREFIX.length) : null;
  }
  return null;
}
