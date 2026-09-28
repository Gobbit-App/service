import { type Db } from '@pb/db';
import { createPocketbooksRepo } from '../repositories/pocketbooks.repo';
import { createCategoriesRepo } from '../repositories/categories.repo';
import { createItemsRepo } from '../repositories/items.repo';
import { createFavoritesRepo } from '../repositories/favorites.repo';
import { createUsersRepo } from '../repositories/users.repo';
import { createPocketbooksService } from './pocketbooks.service';
import { createCategoriesService } from './categories.service';
import { createItemsService } from './items.service';
import { createFavoritesService } from './favorites.service';

export function buildServices(db: Db) {
  const users = createUsersRepo(db);
  const pocketbooks = createPocketbooksRepo(db);
  const categories = createCategoriesRepo(db);
  const items = createItemsRepo(db);
  const favorites = createFavoritesRepo(db);

  return {
    users,
    pocketbooks: createPocketbooksService({ pocketbooks, categories }),
    categories: createCategoriesService({ pocketbooks, categories }),
    items: createItemsService({ pocketbooks, categories, items, favorites }),
    favorites: createFavoritesService({ pocketbooks, items, favorites }),
  };
}

export type Services = ReturnType<typeof buildServices>;
