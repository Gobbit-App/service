import { type Db } from '@pb/db';
import { createDecksRepo } from '../repositories/decks.repo';
import { createCategoriesRepo } from '../repositories/categories.repo';
import { createItemsRepo } from '../repositories/items.repo';
import { createFavoritesRepo } from '../repositories/favorites.repo';
import { createUsersRepo } from '../repositories/users.repo';
import { createDecksService } from './decks.service';
import { createCategoriesService } from './categories.service';
import { createItemsService } from './items.service';
import { createFavoritesService } from './favorites.service';

export function buildServices(db: Db) {
  const users = createUsersRepo(db);
  const decks = createDecksRepo(db);
  const categories = createCategoriesRepo(db);
  const items = createItemsRepo(db);
  const favorites = createFavoritesRepo(db);

  return {
    users,
    decks: createDecksService({ decks, categories }),
    categories: createCategoriesService({ decks, categories }),
    items: createItemsService({ decks, categories, items, favorites }),
    favorites: createFavoritesService({ decks, items, favorites }),
  };
}

export type Services = ReturnType<typeof buildServices>;
