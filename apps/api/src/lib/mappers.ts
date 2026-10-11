import {
  RESERVED_DECK_SLUG,
  type Category,
  type Item,
  type Deck,
  type MemberRole,
} from '@pb/shared';
import type { CategoryRow, ItemRow, DeckRow } from '@pb/db';

/** The personal deck is addressed as `me` whatever its stored slug (Phase 3B). */
export function toDeckDto(r: DeckRow, role: MemberRole): Deck {
  return {
    id: r.id,
    kind: r.kind,
    slug: r.isDefault ? RESERVED_DECK_SLUG : r.slug,
    name: r.name,
    isPublic: r.isPublic,
    isDefault: r.isDefault,
    ownerAccountId: r.ownerAccountId,
    role,
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
