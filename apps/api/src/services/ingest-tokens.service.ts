import {
  INGEST_TOKENS_MAX,
  type IngestTokenCreate,
  type IngestTokenCreated,
  type IngestTokenList,
} from '@pb/shared';
import type { DecksRepo } from '../repositories/decks.repo';
import type { IngestTokensRepo } from '../repositories/ingest-tokens.repo';
import { authorize, type MembershipLookup } from '../access/authorize';
import { conflict, notFound } from '../errors/http-errors';
import { createIngestToken } from '../ingest/ingest-token';
import { toIngestTokenDto } from '../lib/ingest-mappers';
import { isUuid } from '../lib/resolve-deck';
import { hashToken } from '../lib/tokens';
import type { CurrentUser } from '../types';

/** What a valid ingest bearer resolves to. */
export interface IngestTokenAuth {
  user: CurrentUser;
  tokenId: string;
  deckId: string | null;
}

/** D99: per-user ingest tokens (iOS Shortcut, email-in); the plain token is shown once. */
export function createIngestTokensService(deps: {
  tokens: IngestTokensRepo;
  decks: DecksRepo;
  memberships: MembershipLookup;
  now: () => Date;
}) {
  const { tokens, decks, memberships, now } = deps;

  return {
    async list(user: CurrentUser): Promise<IngestTokenList> {
      const rows = await tokens.listLive(user.id);
      return { data: rows.map(toIngestTokenDto) };
    },

    async create(user: CurrentUser, input: IngestTokenCreate): Promise<IngestTokenCreated> {
      if (input.deckId !== undefined) {
        const deck = await decks.findById(input.deckId);
        if (!deck) throw notFound('Deck not found');
        await authorize(user, deck, 'item.create', memberships);
      }
      if ((await tokens.countLive(user.id)) >= INGEST_TOKENS_MAX) {
        throw conflict(`At most ${INGEST_TOKENS_MAX} ingest tokens; revoke one first`);
      }

      const minted = createIngestToken();
      const row = await tokens.create({
        userId: user.id,
        deckId: input.deckId ?? null,
        label: input.label,
        tokenHash: minted.hash,
        prefix: minted.prefix,
      });
      return { ...toIngestTokenDto(row), token: minted.token };
    },

    async revoke(user: CurrentUser, id: string): Promise<void> {
      const revoked = isUuid(id) && (await tokens.revoke(user.id, id, now()));
      if (!revoked) throw notFound('Ingest token not found');
    },

    /** Resolves a plain `ing_` token to its live user; null when unknown or revoked. */
    async authenticate(plain: string): Promise<IngestTokenAuth | null> {
      const found = await tokens.findLiveByHash(hashToken(plain));
      if (!found) return null;
      await tokens.touch(found.token.id, now());
      return { user: found.user, tokenId: found.token.id, deckId: found.token.deckId };
    },
  };
}

export type IngestTokensService = ReturnType<typeof createIngestTokensService>;
