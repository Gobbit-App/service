import type { CurrentUser } from '../types';
import type { DecksRepo } from '../repositories/decks.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import {
  RESERVED_DECK_SLUG,
  type Deck,
  type DeckWithCategories,
  type DeckCreate,
  type DeckPatch,
} from '@pb/shared';
import { toDeckDto, toCategoryDto } from '../lib/mappers';
import { toSlug } from '../lib/slug';
import { resolveDeck } from '../lib/resolve-deck';
import { authorize, type MembershipLookup } from '../access/authorize';
import {
  accountOwnerRequired,
  badRequest,
  conflict,
  PERSONAL_DECK_PROBLEM,
} from '../errors/http-errors';

export function createDecksService({
  decks,
  categories,
  memberships,
  deleteMedia = async () => undefined,
}: {
  decks: DecksRepo;
  categories: CategoriesRepo;
  memberships: MembershipLookup;
  /** D158: drops the deck's stored images once the delete has committed; never throws. */
  deleteMedia?: (deckId: string) => Promise<void>;
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
      if (slug === RESERVED_DECK_SLUG) {
        throw badRequest(
          `The slug "${RESERVED_DECK_SLUG}" is reserved; provide "slug" explicitly`,
          [{ path: 'slug', message: `"${RESERVED_DECK_SLUG}" is reserved` }],
        );
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
      const deck = await resolveDeck(decks, idOrSlug, user);
      const role = await authorize(user, deck, 'deck.read', memberships);
      return toDeckDto(deck, role);
    },

    async update(user: CurrentUser, idOrSlug: string, patch: DeckPatch): Promise<Deck> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      const role = await authorize(user, deck, 'deck.update', memberships);
      // Phase 3B: the personal deck's address and visibility are fixed; its name can change.
      if (deck.isDefault && (patch.slug !== undefined || patch.isPublic !== undefined)) {
        throw conflict(
          "The personal deck's address and visibility can't be changed",
          PERSONAL_DECK_PROBLEM,
        );
      }
      const updated = await decks.update(deck.id, patch);
      return toDeckDto(updated, role);
    },

    async remove(user: CurrentUser, idOrSlug: string): Promise<void> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      await authorize(user, deck, 'deck.delete', memberships);
      // Phase 3B: every user keeps their personal deck.
      if (deck.isDefault) {
        throw conflict("The personal deck can't be deleted", PERSONAL_DECK_PROBLEM);
      }
      // D50: co-owners (owner memberships) may not delete; only the owner account's users.
      if (deck.ownerAccountId !== user.accountId) throw accountOwnerRequired('deck.delete');
      if (await decks.softDelete(deck.id)) await deleteMedia(deck.id);
    },
  };
}

export type DecksService = ReturnType<typeof createDecksService>;
