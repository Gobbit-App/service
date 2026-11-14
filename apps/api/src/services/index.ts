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
import { createRemindersRepo } from '../repositories/reminders.repo';
import { createRemindersService } from './reminders.service';
import { createPendingService } from './pending.service';
import { REMINDER_DECISION_LEVELS, type ReminderDecisions } from './reminders.events';
import { createEventCardsRepo } from '../repositories/event-cards.repo';
import { createEventCardsService } from './event-cards.service';
import { EVENT_CARD_DECISION_LEVELS, type EventCardDecisions } from './event-cards.events';
import { createLogHash } from '../lib/log-hash';
import { decisionLogger } from '../lib/decision-event';
import type { PushSender } from '../push/push-sender';
import { resolvePushSender } from '../push/push-wiring';
import { createPushSubscriptionsRepo } from '../repositories/push-subscriptions.repo';
import { createPushSubscriptionsService } from './push-subscriptions.service';
import { PUSH_SUBSCRIPTION_DECISION_LEVELS, type PushSubscriptionDecisions } from './notify.events';
import { logger as rootLogger, type Logger } from '../lib/logger';
import { WAITLIST_DECISION_LEVELS, type WaitlistDecisions } from './waitlist.events';
import { AUTH_DECISION_LEVELS, type AuthDecisions } from './auth.events';
import {
  ANALYTICS_CONSENT_DECISION_LEVELS,
  type AnalyticsConsentDecisions,
} from './analytics-consent.events';
import { createAnalyticsConsentService } from './analytics-consent.service';
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
import { analyticsHead } from '../public/analytics';
import { createItemDtoMapper } from './item-dtos';
import { createMediaReferenceCheck } from './media-reference';
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
  /** Push sender override (037); production builds it from the VAPID env, null = push off. */
  push?: PushSender | null;
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
  push,
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
  const mediaReference = createMediaReferenceCheck(assets);
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
  // 037 (D291–D299): reminder rules and the `reminder` DTO field on every item response.
  const remindersRepo = createRemindersRepo(db);
  const reminders = createRemindersService({
    reminders: remindersRepo,
    limits: {
      maxDeadlineDays: env.REMINDER_MAX_DEADLINE_DAYS,
      maxShowBeforeDays: env.REMINDER_MAX_SHOW_BEFORE_DAYS,
      resolutionMax: env.REMINDER_RESOLUTION_MAX,
    },
    decisions: decisionLogger<ReminderDecisions>('reminders', {
      parent: logger,
      levels: REMINDER_DECISION_LEVELS,
    }),
    now,
  });
  // 042 (D356–D363): event rules, notice sync and the `event` DTO field.
  const eventCards = createEventCardsService({
    events: createEventCardsRepo(db),
    members: remindersRepo,
    limits: {
      notifyTimesMax: env.EVENT_NOTIFY_TIMES_MAX,
      notifyBeforeMaxDays: env.EVENT_NOTIFY_BEFORE_MAX_DAYS,
      startMaxDays: env.EVENT_START_MAX_DAYS,
      locationMax: env.EVENT_LOCATION_MAX,
      allDayNoticeHour: env.EVENT_ALLDAY_NOTICE_HOUR,
    },
    decisions: decisionLogger<EventCardDecisions>('event-cards', {
      parent: logger,
      levels: EVENT_CARD_DECISION_LEVELS,
    }),
    now,
  });
  const toDtos = createItemDtoMapper({
    items,
    favorites,
    linkChecks,
    reminderStates: reminders.states,
    eventStates: eventCards.states,
  });
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
    mediaReference,
    noticeHook: eventCards.noticeHook,
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
    analyticsConsent: createAnalyticsConsentService({
      users,
      now,
      decisions: decisionLogger<AnalyticsConsentDecisions>('analytics', {
        parent: logger,
        levels: ANALYTICS_CONSENT_DECISION_LEVELS,
      }),
    }),
    rateLimits,
    logHash,
    waitlist,
    // 037 (D298): what is waiting on the member (the bell and /notifications).
    pending: createPendingService({
      decks,
      reminders: remindersRepo,
      events: createEventCardsRepo(db),
      now,
    }),
    // 037 (D297): push devices, test notice and the reminder-email switch.
    pushSubscriptions: createPushSubscriptionsService({
      subscriptions: createPushSubscriptionsRepo(db),
      users,
      push: resolvePushSender(env, push),
      rateLimits,
      decisions: decisionLogger<PushSubscriptionDecisions>('push', {
        parent: logger,
        levels: PUSH_SUBSCRIPTION_DECISION_LEVELS,
      }),
    }),
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
      analytics: analyticsHead(env),
    }),
    items: createItemsService({
      decks,
      categories,
      items,
      favorites,
      memberships,
      embedQueue: resolveEmbedQueue(search),
      mediaReference,
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
      reminders,
      eventCards,
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
