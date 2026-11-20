import type { Category, CategoryCreate, CategoryPatch } from '@gobbit/shared';
import { type CategoriesRepo } from '../repositories/categories.repo';
import { type DecksRepo } from '../repositories/decks.repo';
import { type CurrentUser } from '../types';
import { conflict, notFound } from '../errors/http-errors';
import { findPgError } from '../errors/pg-error-map';
import type { DecisionLogger } from '../lib/decision-event';
import type { CategoryDecisions } from './categories.events';
import { assertPermission, authorize, type MembershipLookup } from '../access/authorize';
import { toCategoryDto } from '../lib/mappers';
import { toCategorySlug, toSlug } from '../lib/slug';
import { resolveDeck } from '../lib/resolve-deck';

export function createCategoriesService({
  decks,
  categories,
  memberships,
  purgeDeck = () => {},
  decisions,
}: {
  decks: DecksRepo;
  categories: CategoriesRepo;
  memberships: MembershipLookup;
  /** D180: drop the deck's cached public pages after each committed write. */
  purgeDeck?: (deckId: string) => void;
  decisions: DecisionLogger<CategoryDecisions>;
}) {
  return {
    async list(user: CurrentUser, idOrSlug: string): Promise<Category[]> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      const role = await authorize(user, deck, 'category.read', memberships);

      const rows = await categories.listByDeck(deck.id, role);
      return rows.map(toCategoryDto);
    },

    async create(
      user: CurrentUser,
      idOrSlug: string,
      input: CategoryCreate,
      ctx: { requestId: string },
    ): Promise<Category> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      const role = await authorize(user, deck, 'category.create', memberships);

      const slug = input.slug ?? toCategorySlug(input.name);
      // D445: only the hash fallback is "derived"; a Latin name keeps its readable slug silently.
      const derived = input.slug === undefined && toSlug(input.name) === '';

      const visibility = input.visibility ?? 'shared';
      if (visibility !== 'shared') {
        // D38 / § 4: roles that cannot see private categories (editors) create `shared` only —
        // neither `private` nor `public` (a public category would expose its cards in Phase 8).
        assertPermission(role, 'category.read_private');
      }
      const maxPos = await categories.maxPosition(deck.id);
      const position = input.position ?? maxPos + 1;

      const row = await categories
        .create({ deckId: deck.id, slug, name: input.name, visibility, position })
        .catch((err: unknown) => {
          if (derived && findPgError(err)?.code === '23505') {
            throw conflict(
              'That name maps to an address already in use; provide "slug" explicitly',
            );
          }
          throw err;
        });
      if (derived) {
        decisions.record('categories.slug_derived', {
          outcome: 'derived',
          reason: 'hash_fallback',
          deckId: deck.id,
          userId: user.id,
          categoryId: row.id,
          requestId: ctx.requestId,
        });
      }
      purgeDeck(deck.id);

      return toCategoryDto(row);
    },

    /** D176: rename or change visibility (`category.update`); slug and default flag never change. */
    async update(
      user: CurrentUser,
      idOrSlug: string,
      categoryId: string,
      patch: CategoryPatch,
    ): Promise<Category> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      const role = await authorize(user, deck, 'category.update', memberships);

      const [visibleId] = await categories.findExistingIds(deck.id, [categoryId], role);
      if (!visibleId) {
        throw notFound('Category not found');
      }

      const row = await categories.update(visibleId, {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.visibility !== undefined && { visibility: patch.visibility }),
      });
      purgeDeck(deck.id);
      return toCategoryDto(row);
    },
  };
}

export type CategoriesService = ReturnType<typeof createCategoriesService>;
