import type { Item, ItemPage } from '@gobbit/shared';

/** TanStack Query paginated data shape. */
export type PagesData = { pages: ItemPage[]; pageParams: unknown[] };

/**
 * Updates a favorite flag on an item within paginated pages, maintaining reference equality for untouched objects.
 */
export function setFavoriteInPages(
  data: PagesData | undefined,
  itemId: string,
  isFavorite: boolean,
): PagesData | undefined {
  if (!data) {
    return undefined;
  }

  let changed = false;
  const newPages: ItemPage[] = [];

  for (const page of data.pages) {
    let pageChanged = false;
    const newData: Item[] = [];

    for (const item of page.data) {
      if (item.id === itemId && item.isFavorite !== isFavorite) {
        newData.push({ ...item, isFavorite });
        pageChanged = true;
        changed = true;
      } else {
        newData.push(item);
      }
    }

    if (pageChanged) {
      newPages.push({ ...page, data: newData });
    } else {
      newPages.push(page);
    }
  }

  if (!changed) {
    return data;
  }

  return { ...data, pages: newPages };
}

/**
 * Updates a favorite flag on an item, maintaining reference equality when unchanged.
 */
export function setFavoriteOnItem(
  item: Item | undefined,
  itemId: string,
  isFavorite: boolean,
): Item | undefined {
  if (!item) {
    return undefined;
  }

  if (item.id !== itemId || item.isFavorite === isFavorite) {
    return item;
  }

  return { ...item, isFavorite };
}

/**
 * Removes an item from paginated pages, maintaining reference equality for untouched objects.
 */
export function removeFromPages(
  data: PagesData | undefined,
  itemId: string,
): PagesData | undefined {
  if (!data) {
    return undefined;
  }

  let changed = false;
  const newPages: ItemPage[] = [];

  for (const page of data.pages) {
    const newData = page.data.filter((item) => item.id !== itemId);

    if (newData.length !== page.data.length) {
      changed = true;
      newPages.push({ ...page, data: newData });
    } else {
      newPages.push(page);
    }
  }

  if (!changed) {
    return data;
  }

  return { ...data, pages: newPages };
}

/**
 * D146: inserts `item` where `rank` orders it (larger first, the API's `desc` sort), or
 * replaces it in place when already listed. A card that would sort after everything loaded
 * while more pages exist is left out (the next page brings it). An unloaded list stays
 * unloaded.
 */
export function insertIntoPages(
  data: PagesData | undefined,
  item: Item,
  rank: (item: Item) => string,
): PagesData | undefined {
  if (!data) {
    return undefined;
  }

  const without = removeFromPages(data, item.id) ?? data;
  const key = rank(item);

  for (let p = 0; p < without.pages.length; p++) {
    const page = without.pages[p];
    const index = page.data.findIndex((other) => rank(other) < key);
    if (index !== -1) {
      const newData = [...page.data.slice(0, index), item, ...page.data.slice(index)];
      const newPages = [...without.pages];
      newPages[p] = { ...page, data: newData };
      return { ...without, pages: newPages };
    }
  }

  const last = without.pages[without.pages.length - 1];
  if (!last || last.nextCursor) {
    return without;
  }
  const newPages = [...without.pages];
  newPages[newPages.length - 1] = { ...last, data: [...last.data, item] };
  return { ...without, pages: newPages };
}
