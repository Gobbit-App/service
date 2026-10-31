import { type Db, type DbTx } from '@gobbit/db';
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
import { createSitemapRepo } from '../repositories/sitemap.repo';
import { createItemEventsRepo } from '../repositories/item-events.repo';
import { createWaitlistRepo } from '../repositories/waitlist.repo';
import { createLogHash } from '../lib/log-hash';
import { decisionLogger } from '../lib/decision-event';
import { logger as rootLogger, type Logger } from '../lib/logger';
import { WAITLIST_DECISION_LEVELS, type WaitlistDecisions } from './waitlist.events';
import { AUTH_DECISION_LEVELS, type AuthDecisions } from './auth.events';
import { createPageCache } from '../public/page-cache';
import { extractPage } from '../fetch/extract-page';
import { createDecksService } from './decks.service';
import { createCategoriesService } from './categories.service';
import { createPublicDeckService } from './public-deck.service';
import { createPublicPagesService } from './public-pages.service';
import { createItemsService } from './items.service';
import { createFavoritesService } from './favorites.service';
import { createEventsService } from './events.service';
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
import { createImportsService } from './imports.service';
import { createWaitlistService } from './waitlist.service';
import { buildAdminServices, type RegistrationDeps } from './admin-wiring';
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
  /** Parent logger for decision events (D239); integration tests capture it. */
  logger?: Logger;
}

/** Repos and the users service bound to one transaction (Phase 3B magic-link callback). */
export function buildCallbackRepos(tx: DbTx, registration: RegistrationDeps): CallbackRepos {
  const users = createUsersRepo(tx);
  const decks = createDecksRepo(tx);
  return {
    sessions: createSessionsRepo(tx),
    magicLinks: createMagicLinksRepo(tx),
    memberships: createMembershipsRepo(tx),
    decks,
    users,
    usersService: createUsersService({ users, decks, ...registration }),
  };
}

export function buildServices({
  db,
  env,
  mailer,
  now = () => new Date(),
  share: shareWiring,
  search,
  ingest,
  media,
  logger = rootLogger,
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
  // D180: rendered public pages; every write that changes public content purges its deck.
  const pageCache = createPageCache();
  const purgeDeck = (deckId: string) => pageCache.purgeDeck(deckId);
  const publicDecks = createPublicDeckService({ decks, categories, items });
  const share = buildShareService(db, env, shareWiring);

  // D239: keyed hashes for decision events (emailHash, ipHash).
  const logHash = createLogHash(env.LOG_HASH_KEY);
  // D222/D241: one registration policy for every users service (request and callback tx).
  const registration: RegistrationDeps = {
    mode: env.REGISTRATION_MODE,
    logHash,
    decisions: decisionLogger<AuthDecisions>('users', {
      parent: logger,
      levels: AUTH_DECISION_LEVELS,
    }),
  };
  const usersService = createUsersService({ users, decks, ...registration });
  const rateLimits = createRateLimitService({ repo: createRateLimitsRepo(db), now });
  const toDtos = createItemDtoMapper({ items, favorites, linkChecks });
  const searchServices = buildSearchServices({
    db,
    env,
    decks,
    memberships,
    publicDecks,
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
    purgeDeck,
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
    db.transaction((tx) => fn(buildCallbackRepos(tx, registration)));
  const waitlist = createWaitlistService({
    env,
    now,
    mailer,
    waitlist: createWaitlistRepo(db),
    transaction: (fn) => db.transaction((tx) => fn(createWaitlistRepo(tx))),
    users,
    rateLimits,
    logHash,
    decisions: decisionLogger<WaitlistDecisions>('waitlist', {
      parent: logger,
      levels: WAITLIST_DECISION_LEVELS,
    }),
  });

  return {
    users: usersService,
    rateLimits,
    logHash,
    waitlist,
    ...buildAdminServices({ db, env, mailer, now, logger, registration }),
    auth: createAuthService({
      env,
      now,
      mailer,
      sessions,
      magicLinks,
      transaction,
      rateLimits,
      usersService,
      waitlist,
      mode: env.REGISTRATION_MODE,
      logHash,
      decisions: decisionLogger<AuthDecisions>('auth', {
        parent: logger,
        levels: AUTH_DECISION_LEVELS,
      }),
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
      purgeDeck,
    }),
    categories: createCategoriesService({ decks, categories, memberships, purgeDeck }),
    publicDecks,
    publicPages: createPublicPagesService({
      publicDecks,
      decks,
      memberships,
      sitemap: createSitemapRepo(db),
      share,
      cache: pageCache,
      search: searchServices.search,
    }),
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
      purgeDeck,
    }),
    favorites: createFavoritesService({ decks, items, favorites, memberships }),
    events: createEventsService({ decks, memberships, events: createItemEventsRepo(db) }),
    share,
    search: searchServices.search,
    ask: searchServices.ask,
    ingest: ingestServices.ingest,
    ingestTokens: ingestServices.ingestTokens,
    review: ingestServices.review,
    shares: ingestServices.shares,
    imports: createImportsService({ decks, memberships, ingest: ingestServices.ingest }),
    media: mediaServices.media,
    linkPreview: mediaServices.linkPreview,
  };
}

export type Services = ReturnType<typeof buildServices>;
