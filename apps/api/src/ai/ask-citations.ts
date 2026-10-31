import type { AskCitation } from '@gobbit/shared';

/** D77: keep cited ids that were retrieved, in citation order, de-duplicated; titles from the retrieved cards. */
export function resolveCitations(
  citedItemIds: readonly string[],
  cards: readonly { id: string; title: string }[],
): AskCitation[] {
  const titleById = new Map<string, string>();
  for (const card of cards) {
    if (!titleById.has(card.id)) titleById.set(card.id, card.title);
  }

  const seen = new Set<string>();
  const citations: AskCitation[] = [];
  for (const id of citedItemIds) {
    if (seen.has(id)) continue;
    const title = titleById.get(id);
    if (title === undefined) continue;
    seen.add(id);
    citations.push({ itemId: id, title });
  }
  return citations;
}
