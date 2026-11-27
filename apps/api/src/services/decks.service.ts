import type { MembershipRow } from '@gobbit/db';
import type { CurrentUser } from '../types';
import type { DecisionLogger } from '../lib/decision-event';
import type { MemberSummaries } from './member-summaries';
import type { DeckDecisions } from './decks.events';
import type { DecksRepo } from '../repositories/decks.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import {
  RESERVED_DECK_SLUG,
  type Deck,
  type DeckWithCategories,
  type DeckCreate,
  type DeckPatch,
  type DeckDetail,
} from '@gobbit/shared';
import { toDeckDto, toCategoryDto } from '../lib/mappers';
import { toSlug } from '../lib/slug';
import { resolveDeck } from '../lib/resolve-deck';
import { authorize } from '../access/authorize';
import {
  accountOwnerRequired,
  badRequest,
  conflict,
  ownerRequired,
  PERSONAL_DECK_PROBLEM,
} from '../errors/http-errors';

type WelcomeMemberships = {
  findActive(deckId: string, userId: string): Promise<MembershipRow | null>;
  dismissWelcome(id: string, now: Date): Promise<boolean>;
};

export function createDecksService({
  decks,
  categories,
  memberships,
  decisions,
  summaries,
  now = () => new Date(),
  deleteMedia = async () => undefined,
  purgeDeck = () => {},
}: {
  decks: DecksRepo;
  categories: CategoriesRepo;
  memberships: WelcomeMemberships;
  decisions: DecisionLogger<DeckDecisions>;
  summaries?: Pick<MemberSummaries, 'summaries'>;
  now?: () => Date;
  /** D158: drops the deck's stored images once the delete has committed; never throws. */
  deleteMedia?: (deckId: string) => Promise<void>;
  /** D180: drop the deck's cached public pages after each committed write. */
  purgeDeck?: (deckId: string) => void;
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

    /** D479: `welcome` is set only for an accepted, undismissed member outside the owning account. */
    async get(user: CurrentUser, idOrSlug: string): Promise<DeckDetail> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      const role = await authorize(user, deck, 'deck.read', memberships);
      const dto = toDeckDto(deck, role);
      if (deck.ownerAccountId === user.accountId) return { ...dto, welcome: null };
      const m = await memberships.findActive(deck.id, user.id);
      if (!m?.acceptedAt || m.welcomeDismissedAt) return { ...dto, welcome: null };
      const inviter = m.invitedBy
        ? ((await summaries?.summaries([m.invitedBy]))?.get(m.invitedBy) ?? null)
        : null;
      return { ...dto, welcome: { membershipId: m.id, inviter } };
    },

    /** D480, D481: idempotent; the real outcome is logged, the client sees the same answer. */
    async dismissWelcome(
      user: CurrentUser,
      idOrSlug: string,
      ctx: { requestId: string },
    ): Promise<void> {
      const deck = await resolveDeck(decks, idOrSlug, user);
      await authorize(user, deck, 'deck.read', memberships);
      const base = { userId: user.id, deckId: deck.id, requestId: ctx.requestId };
      const m =
        deck.ownerAccountId === user.accountId
          ? null
          : await memberships.findActive(deck.id, user.id);
      if (!m) {
        decisions.record('deck.welcome_dismiss', { outcome: 'no_membership', ...base });
        return;
      }
      const changed = await memberships.dismissWelcome(m.id, now());
      decisions.record('deck.welcome_dismiss', {
        outcome: changed ? 'dismissed' : 'already_dismissed',
        membershipId: m.id,
        ...base,
      });
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
      // D176: making a deck public (or private again) is an owner decision.
      if (patch.isPublic !== undefined && role !== 'owner') {
        throw ownerRequired();
      }
      // D192: publishing shares directly is an owner decision too (the personal deck included).
      if (patch.autoPublishShares !== undefined && role !== 'owner') {
        throw ownerRequired('Only a deck owner can change whether shares publish directly');
      }
      const updated = await decks.update(deck.id, patch);
      purgeDeck(deck.id);
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
      if (await decks.softDelete(deck.id)) {
        purgeDeck(deck.id);
        await deleteMedia(deck.id);
      }
    },
  };
}

export type DecksService = ReturnType<typeof createDecksService>;
