import type { Category, CategoryCreate } from '@pb/shared';
import { type CategoriesRepo } from '../repositories/categories.repo';
import { type DecksRepo } from '../repositories/decks.repo';
import { type CurrentUser } from '../types';
import { badRequest } from '../errors/http-errors';
import { toCategoryDto } from '../lib/mappers';
import { toSlug } from '../lib/slug';
import { assertDeckAccess } from '../access/assert-deck-access';
import { resolveDeck } from '../lib/resolve-deck';

export function createCategoriesService({
  decks,
  categories,
}: {
  decks: DecksRepo;
  categories: CategoriesRepo;
}) {
  return {
    async list(user: CurrentUser, idOrSlug: string): Promise<Category[]> {
      const deck = await resolveDeck(decks, idOrSlug);
      assertDeckAccess(user, deck, 'read');

      const rows = await categories.listByDeck(deck.id);
      return rows.map(toCategoryDto);
    },

    async create(user: CurrentUser, idOrSlug: string, input: CategoryCreate): Promise<Category> {
      const deck = await resolveDeck(decks, idOrSlug);
      assertDeckAccess(user, deck, 'write');

      const slug = input.slug ?? toSlug(input.name);
      if (slug === '') {
        throw badRequest('Could not derive a slug from the name; provide "slug" explicitly', [
          { path: 'slug', message: 'Required' },
        ]);
      }

      const visibility = input.visibility ?? 'shared';
      const maxPos = await categories.maxPosition(deck.id);
      const position = input.position ?? maxPos + 1;

      const row = await categories.create({
        deckId: deck.id,
        slug,
        name: input.name,
        visibility,
        position,
      });

      return toCategoryDto(row);
    },
  };
}

export type CategoriesService = ReturnType<typeof createCategoriesService>;
