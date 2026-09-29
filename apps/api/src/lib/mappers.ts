import type { Category, Item, Deck } from '@pb/shared';
import type { CategoryRow, ItemRow, DeckRow } from '@pb/db';

export function toDeckDto(r: DeckRow): Deck {
  return {
    id: r.id,
    kind: r.kind,
    slug: r.slug,
    name: r.name,
    isPublic: r.isPublic,
    ownerAccountId: r.ownerAccountId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toCategoryDto(r: CategoryRow): Category {
  return {
    id: r.id,
    deckId: r.deckId,
    slug: r.slug,
    name: r.name,
    visibility: r.visibility,
    isDefault: r.isDefault,
    position: r.position,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toItemDto(r: ItemRow, categoryIds: string[], isFavorite: boolean): Item {
  return {
    id: r.id,
    deckId: r.deckId,
    type: r.type,
    status: r.status,
    title: r.title,
    body: r.body,
    payload: r.payload,
    sourceUrl: r.sourceUrl ?? null,
    sourceKind: r.sourceKind,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    createdBy: r.createdBy ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    categoryIds,
    isFavorite,
  };
}
