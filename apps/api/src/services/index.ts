import { type Db, type DbTx } from '@pb/db';
import type { Env } from '../env';
import type { Mailer } from '../mail/mailer';
import { createDecksRepo } from '../repositories/decks.repo';
import { createCategoriesRepo } from '../repositories/categories.repo';
import { createItemsRepo } from '../repositories/items.repo';
import { createFavoritesRepo } from '../repositories/favorites.repo';
import { createUsersRepo } from '../repositories/users.repo';
import { createMembershipsRepo } from '../repositories/memberships.repo';
import { createSessionsRepo } from '../repositories/sessions.repo';
import { createMagicLinksRepo } from '../repositories/magic-links.repo';
import { createRateLimitsRepo } from '../repositories/rate-limits.repo';
import { createAssetsRepo } from '../repositories/assets.repo';
import { createLinkChecksRepo } from '../repositories/link-checks.repo';
import { extractPage } from '../fetch/extract-page';
import { createDecksService } from './decks.service';
import { createCategoriesService } from './categories.service';
import { createPublicDeckService } from './public-deck.service';
import { createItemsService } from './items.service';
import { createFavoritesService } from './favorites.service';
import { createUsersService } from './users.service';
import { createRateLimitService } from './rate-limit.service';
import { createAuthService, type CallbackRepos, type CallbackTransaction } from './auth.service';
import { createMembershipsService } from './memberships.service';
import { buildShareService, type ShareWiring } from '../share/wiring';
import { createItemDtoMapper } from './item-dtos';
import { createImageReferenceCheck } from './image-reference';
import { createLinkPreviewFields } from './link-preview-fields';
import { createLinkChecksService, createLinkProbe } from './link-checks.service';
import {
  buildSearchServices,
  resolveEmbedder,
  resolveEmbedQueue,
  type SearchWiring,
} from './search-wiring';
import { buildIngestServices, type IngestWiring } from './ingest-wiring';
import {
  buildMediaServices,
  resolveLinkCheckFetch,
  resolveLinkSnapshotQueue,
  type MediaWiring,
} from './media-wiring';

export interface ServiceDeps {
  db: Db;
  env: Env;
  mailer: Mailer;
  now?: () => Date;
  /** OG store/renderer overrides (D60); production builds them from env. */
  share?: ShareWiring;
  /** Embedder/asker/queue overrides (Phase 4); production builds them from env. */
  search?: SearchWiring;
  /** Ingest uploads/queue/enabled overrides (Phase 5); production builds them from env. */
  ingest?: IngestWiring;
  /** Link preview fetcher, image fetcher and media store overrides (Phase 6, 7). */
  media?: MediaWiring;
}

/** Repos and the users service bound to one transaction (Phase 3B magic-link callback). */
export function buildCallbackRepos(tx: DbTx): CallbackRepos {
  const users = createUsersRepo(tx);
  const decks = createDecksRepo(tx);
  return {
    sessions: createSessionsRepo(tx),
    magicLinks: createMagicLinksRepo(tx),
    memberships: createMembershipsRepo(tx),
    decks,
    users,
    usersService: createUsersService({ users, decks }),
  };
}

export function buildServices({
  db,
  env,
  mailer,
  now = () => new Date(),
  share,
  search,
  ingest,
  media,
}: ServiceDeps) {
  const users = createUsersRepo(db);
  const decks = createDecksRepo(db);
  const categories = createCategoriesRepo(db);
  const items = createItemsRepo(db);
  const favorites = createFavoritesRepo(db);
  const memberships = createMembershipsRepo(db);
  const sessions = createSessionsRepo(db);
  const magicLinks = createMagicLinksRepo(db);
  const assets = createAssetsRepo(db);
  const imageReference = createImageReferenceCheck(assets);
  const linkChecks = createLinkChecksRepo(db);

  const usersService = createUsersService({ users, decks });
  const rateLimits = createRateLimitService({ repo: createRateLimitsRepo(db), now });
  const toDtos = createItemDtoMapper({ items, favorites, linkChecks });
  const searchServices = buildSearchServices({
    db,
    env,
    decks,
    memberships,
    rateLimits,
    toDtos,
    wiring: search,
  });
  const ingestServices = buildIngestServices({
    db,
    env,
    decks,
    memberships,
    items,
    users,
    toDtos,
    embedQueue: resolveEmbedQueue(search),
    linkSnapshotQueue: resolveLinkSnapshotQueue(media),
    embedder: resolveEmbedder(env, search),
    assets,
    imageReference,
    now,
    wiring: ingest,
  });
  const mediaServices = buildMediaServices({
    env,
    decks,
    memberships,
    rateLimits,
    assets,
    now,
    wiring: media,
  });
  const transaction: CallbackTransaction = (fn) =>
    db.transaction((tx) => fn(buildCallbackRepos(tx)));

  return {
    users: usersService,
    rateLimits,
    auth: createAuthService({
      env,
      now,
      mailer,
      sessions,
      magicLinks,
      transaction,
      rateLimits,
    }),
    members: createMembershipsService({
      env,
      now,
      mailer,
      decks,
      memberships,
      magicLinks,
      users,
      usersService,
    }),
    decks: createDecksService({
      decks,
      categories,
      memberships,
      deleteMedia: mediaServices.media.deleteForDeck,
    }),
    categories: createCategoriesService({ decks, categories, memberships }),
    publicDecks: createPublicDeckService({ decks, categories, items }),
    items: createItemsService({
      decks,
      categories,
      items,
      favorites,
      memberships,
      embedQueue: resolveEmbedQueue(search),
      imageReference,
      links: {
        checks: linkChecks,
        checker: createLinkChecksService({
          linkChecks,
          probe: createLinkProbe({ safeFetch: resolveLinkCheckFetch(media), extract: extractPage }),
          now,
        }),
        previewFields: createLinkPreviewFields(assets),
        snapshotQueue: resolveLinkSnapshotQueue(media),
        rateLimits,
      },
      now,
    }),
    favorites: createFavoritesService({ decks, items, favorites, memberships }),
    share: buildShareService(db, env, share),
    search: searchServices.search,
    ask: searchServices.ask,
    ingest: ingestServices.ingest,
    ingestTokens: ingestServices.ingestTokens,
    review: ingestServices.review,
    media: mediaServices.media,
    linkPreview: mediaServices.linkPreview,
  };
}

export type Services = ReturnType<typeof buildServices>;
