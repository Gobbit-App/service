import type { Category, CategoryCreate } from '@pb/shared';
import { type CategoriesRepo } from '../repositories/categories.repo';
import { type DecksRepo } from '../repositories/decks.repo';
import { type CurrentUser } from '../types';
import { badRequest } from '../errors/http-errors';
import { assertPermission, authorize, type MembershipLookup } from '../access/authorize';
import { toCategoryDto } from '../lib/mappers';
import { toSlug } from '../lib/slug';
import { resolveDeck } from '../lib/resolve-deck';

export function createCategoriesService({
  decks,
  categories,
  memberships,
}: {
  decks: DecksRepo;
  categories: CategoriesRepo;
  memberships: MembershipLookup;
}) {
  return {
    async list(user: CurrentUser, idOrSlug: string): Promise<Category[]> {
      const deck = await resolveDeck(decks, idOrSlug);
      const role = await authorize(user, deck, 'category.read', memberships);

      const rows = await categories.listByDeck(deck.id, role);
      return rows.map(toCategoryDto);
    },

    async create(user: CurrentUser, idOrSlug: string, input: CategoryCreate): Promise<Category> {
      const deck = await resolveDeck(decks, idOrSlug);
      const role = await authorize(user, deck, 'category.create', memberships);

      const slug = input.slug ?? toSlug(input.name);
      if (slug === '') {
        throw badRequest('Could not derive a slug from the name; provide "slug" explicitly', [
          { path: 'slug', message: 'Required' },
        ]);
      }

      const visibility = input.visibility ?? 'shared';
      if (visibility === 'private') {
        // D38: only roles that can see private categories may create one.
        assertPermission(role, 'category.read_private');
      }
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
