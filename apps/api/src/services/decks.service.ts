import type { CurrentUser } from '../types';
import type { DecksRepo } from '../repositories/decks.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import { type Deck, type DeckWithCategories, type DeckCreate, type DeckPatch } from '@pb/shared';
import { toDeckDto, toCategoryDto } from '../lib/mappers';
import { toSlug } from '../lib/slug';
import { resolveDeck } from '../lib/resolve-deck';
import { authorize, type MembershipLookup } from '../access/authorize';
import { badRequest } from '../errors/http-errors';

export function createDecksService({
  decks,
  categories,
  memberships,
}: {
  decks: DecksRepo;
  categories: CategoriesRepo;
  memberships: MembershipLookup;
}) {
  return {
    /** D33: owned ∪ member-of, each with the caller's role. */
    async list(user: CurrentUser): Promise<Deck[]> {
      const rows = await decks.listForUser(user.id, user.accountId);
      return rows.map(({ deck, role }) => toDeckDto(deck, role));
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

      const cats = await categories.listByDeck(created.id, 'owner');

      return {
        ...toDeckDto(created, 'owner'),
        categories: cats.map(toCategoryDto),
      };
    },

    async get(user: CurrentUser, idOrSlug: string): Promise<Deck> {
      const deck = await resolveDeck(decks, idOrSlug);
      const role = await authorize(user, deck, 'deck.read', memberships);
      return toDeckDto(deck, role);
    },

    async update(user: CurrentUser, idOrSlug: string, patch: DeckPatch): Promise<Deck> {
      const deck = await resolveDeck(decks, idOrSlug);
      const role = await authorize(user, deck, 'deck.update', memberships);
      const updated = await decks.update(deck.id, patch);
      return toDeckDto(updated, role);
    },

    async remove(user: CurrentUser, idOrSlug: string): Promise<void> {
      const deck = await resolveDeck(decks, idOrSlug);
      await authorize(user, deck, 'deck.delete', memberships);
      await decks.softDelete(deck.id);
    },
  };
}

export type DecksService = ReturnType<typeof createDecksService>;
