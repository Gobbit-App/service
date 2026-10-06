import type { Item, ItemPage } from '@pb/shared';

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
