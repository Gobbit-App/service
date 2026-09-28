import type { Category, CategoryCreate } from '@pb/shared';
import { type CategoriesRepo } from '../repositories/categories.repo';
import { type PocketbooksRepo } from '../repositories/pocketbooks.repo';
import { type CurrentUser } from '../types';
import { badRequest } from '../errors/http-errors';
import { toCategoryDto } from '../lib/mappers';
import { toSlug } from '../lib/slug';
import { assertPocketbookAccess } from '../access/assert-pocketbook-access';
import { resolvePocketbook } from '../lib/resolve-pocketbook';

export function createCategoriesService({
  pocketbooks,
  categories,
}: {
  pocketbooks: PocketbooksRepo;
  categories: CategoriesRepo;
}) {
  return {
    async list(user: CurrentUser, idOrSlug: string): Promise<Category[]> {
      const pocketbook = await resolvePocketbook(pocketbooks, idOrSlug);
      assertPocketbookAccess(user, pocketbook, 'read');

      const rows = await categories.listByPocketbook(pocketbook.id);
      return rows.map(toCategoryDto);
    },

    async create(user: CurrentUser, idOrSlug: string, input: CategoryCreate): Promise<Category> {
      const pocketbook = await resolvePocketbook(pocketbooks, idOrSlug);
      assertPocketbookAccess(user, pocketbook, 'write');

      const slug = input.slug ?? toSlug(input.name);
      if (slug === '') {
        throw badRequest('Could not derive a slug from the name; provide "slug" explicitly', [
          { path: 'slug', message: 'Required' },
        ]);
      }

      const visibility = input.visibility ?? 'shared';
      const maxPos = await categories.maxPosition(pocketbook.id);
      const position = input.position ?? maxPos + 1;

      const row = await categories.create({
        pocketbookId: pocketbook.id,
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
