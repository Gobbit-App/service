import type { Category, ItemCreateInput } from '@pb/shared';

export type CardType = 'text' | 'link';

/** What the editor form holds; only the fields of the chosen type are sent. */
export type CardDraft = {
  type: CardType;
  title: string;
  body: string;
  url: string;
  categoryId: string | null;
};

/** Builds the `POST /decks/{id}/items` body for the chosen card type (contract §12). */
export function buildCardInput(draft: CardDraft): ItemCreateInput {
  const categoryIds = draft.categoryId ? [draft.categoryId] : [];
  if (draft.type === 'link') {
    return { type: 'link', title: draft.title, payload: { url: draft.url.trim() }, categoryIds };
  }
  return { type: 'text', title: draft.title, body: draft.body, payload: {}, categoryIds };
}

/** The category a new card starts in: the deck's default one, if it has one. */
export function defaultCategoryId(categories: readonly Category[]): string | null {
  return categories.find((category) => category.isDefault)?.id ?? null;
}
