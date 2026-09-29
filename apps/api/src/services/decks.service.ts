import type { CurrentUser } from '../types';
import type { DecksRepo } from '../repositories/decks.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import { type Deck, type DeckWithCategories, type DeckCreate, type DeckPatch } from '@pb/shared';
import { toDeckDto, toCategoryDto } from '../lib/mappers';
import { toSlug } from '../lib/slug';
import { resolveDeck } from '../lib/resolve-deck';
import { assertDeckAccess } from '../access/assert-deck-access';
import { badRequest } from '../errors/http-errors';

export function createDecksService({
  decks,
  categories,
}: {
  decks: DecksRepo;
  categories: CategoriesRepo;
}) {
  return {
    async list(user: CurrentUser): Promise<Deck[]> {
      const rows = await decks.listByOwner(user.accountId);
      return rows.map(toDeckDto);
    },

    async create(user: CurrentUser, input: DeckCreate): Promise<DeckWithCategories> {
      const slug = input.slug ?? toSlug(input.name);
      if (slug === '') {
        throw badRequest('Could not derive a slug from the name; provide "slug" explicitly', [
          { path: 'slug', message: 'Required' },
        ]);
      }

      const kind = input.kind ?? 'personal';
      const isPublic = input.isPublic ?? false;

      const created = await decks.create({
        kind,
        slug,
        name: input.name,
        isPublic,
        ownerAccountId: user.accountId,
      });

      const cats = await categories.listByDeck(created.id);

      return {
        ...toDeckDto(created),
        categories: cats.map(toCategoryDto),
      };
    },

    async get(user: CurrentUser, idOrSlug: string): Promise<Deck> {
      const pb = await resolveDeck(decks, idOrSlug);
      assertDeckAccess(user, pb, 'read');
      return toDeckDto(pb);
    },

    async update(user: CurrentUser, idOrSlug: string, patch: DeckPatch): Promise<Deck> {
      const pb = await resolveDeck(decks, idOrSlug);
      assertDeckAccess(user, pb, 'write');
      const updated = await decks.update(pb.id, patch);
      return toDeckDto(updated);
    },

    async remove(user: CurrentUser, idOrSlug: string): Promise<void> {
      const pb = await resolveDeck(decks, idOrSlug);
      assertDeckAccess(user, pb, 'write');
      await decks.softDelete(pb.id);
    },
  };
}

export type DecksService = ReturnType<typeof createDecksService>;
