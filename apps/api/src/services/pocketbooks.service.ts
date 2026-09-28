import type { CurrentUser } from '../types';
import type { PocketbooksRepo } from '../repositories/pocketbooks.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import {
  type Pocketbook,
  type PocketbookWithCategories,
  type PocketbookCreate,
  type PocketbookPatch,
} from '@pb/shared';
import { toPocketbookDto, toCategoryDto } from '../lib/mappers';
import { toSlug } from '../lib/slug';
import { resolvePocketbook } from '../lib/resolve-pocketbook';
import { assertPocketbookAccess } from '../access/assert-pocketbook-access';
import { badRequest } from '../errors/http-errors';

export function createPocketbooksService({
  pocketbooks,
  categories,
}: {
  pocketbooks: PocketbooksRepo;
  categories: CategoriesRepo;
}) {
  return {
    async list(user: CurrentUser): Promise<Pocketbook[]> {
      const rows = await pocketbooks.listByOwner(user.accountId);
      return rows.map(toPocketbookDto);
    },

    async create(user: CurrentUser, input: PocketbookCreate): Promise<PocketbookWithCategories> {
      const slug = input.slug ?? toSlug(input.name);
      if (slug === '') {
        throw badRequest('Could not derive a slug from the name; provide "slug" explicitly', [
          { path: 'slug', message: 'Required' },
        ]);
      }

      const kind = input.kind ?? 'personal';
      const isPublic = input.isPublic ?? false;

      const created = await pocketbooks.create({
        kind,
        slug,
        name: input.name,
        isPublic,
        ownerAccountId: user.accountId,
      });

      const cats = await categories.listByPocketbook(created.id);

      return {
        ...toPocketbookDto(created),
        categories: cats.map(toCategoryDto),
      };
    },

    async get(user: CurrentUser, idOrSlug: string): Promise<Pocketbook> {
      const pb = await resolvePocketbook(pocketbooks, idOrSlug);
      assertPocketbookAccess(user, pb, 'read');
      return toPocketbookDto(pb);
    },

    async update(user: CurrentUser, idOrSlug: string, patch: PocketbookPatch): Promise<Pocketbook> {
      const pb = await resolvePocketbook(pocketbooks, idOrSlug);
      assertPocketbookAccess(user, pb, 'write');
      const updated = await pocketbooks.update(pb.id, patch);
      return toPocketbookDto(updated);
    },
  };
}

export type PocketbooksService = ReturnType<typeof createPocketbooksService>;
