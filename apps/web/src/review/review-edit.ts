import type { Item, ItemPatch } from '@pb/shared';

/** What the inline review editor holds (D107: title, text, link and categories). */
export type ReviewDraft = {
  title: string;
  body: string;
  url: string;
  categoryIds: string[];
};

function payloadUrl(item: Pick<Item, 'payload'>): string {
  const url = item.payload['url'];
  return typeof url === 'string' ? url : '';
}

export function draftFromItem(item: Item): ReviewDraft {
  return {
    title: item.title,
    body: item.body,
    url: payloadUrl(item),
    categoryIds: [...item.categoryIds],
  };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/** Only the fields the reviewer changed; `null` when nothing did (PATCH needs ≥1 field). */
export function buildReviewPatch(item: Item, draft: ReviewDraft): ItemPatch | null {
  const patch: ItemPatch = {};
  if (draft.title !== item.title) patch.title = draft.title;
  if (draft.body !== item.body) patch.body = draft.body;
  const url = draft.url.trim();
  if (item.type === 'link' && url !== payloadUrl(item)) patch.payload = { ...item.payload, url };
  if (!sameIds(draft.categoryIds, item.categoryIds)) patch.categoryIds = draft.categoryIds;
  return Object.keys(patch).length > 0 ? patch : null;
}
