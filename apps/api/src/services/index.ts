import { type Db } from '@pb/db';
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
import { createDecksService } from './decks.service';
import { createCategoriesService } from './categories.service';
import { createItemsService } from './items.service';
import { createFavoritesService } from './favorites.service';
import { createUsersService } from './users.service';
import { createRateLimitService } from './rate-limit.service';
import { createAuthService } from './auth.service';
import { createMembershipsService } from './memberships.service';
import { buildShareService, type ShareWiring } from '../share/wiring';

export interface ServiceDeps {
  db: Db;
  env: Env;
  mailer: Mailer;
  now?: () => Date;
  /** OG store/renderer overrides (D60); production builds them from env. */
  share?: ShareWiring;
}

export function buildServices({ db, env, mailer, now = () => new Date(), share }: ServiceDeps) {
  const users = createUsersRepo(db);
  const decks = createDecksRepo(db);
  const categories = createCategoriesRepo(db);
  const items = createItemsRepo(db);
  const favorites = createFavoritesRepo(db);
  const memberships = createMembershipsRepo(db);
  const sessions = createSessionsRepo(db);
  const magicLinks = createMagicLinksRepo(db);

  const usersService = createUsersService({ users });
  const rateLimits = createRateLimitService({ repo: createRateLimitsRepo(db), now });

  return {
    users: usersService,
    rateLimits,
    auth: createAuthService({
      env,
      now,
      mailer,
      sessions,
      magicLinks,
      memberships,
      decks,
      users,
      usersService,
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
    decks: createDecksService({ decks, categories, memberships }),
    categories: createCategoriesService({ decks, categories, memberships }),
    items: createItemsService({ decks, categories, items, favorites, memberships }),
    favorites: createFavoritesService({ decks, items, favorites, memberships }),
    share: buildShareService(db, env, share),
  };
}

export type Services = ReturnType<typeof buildServices>;
