import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Category, Deck } from '@gobbit/shared';
import { isApiError } from './api-error';
import { api, unwrap } from './client';
import { categoriesQuery } from './queries';
import { queryKeys } from './query-keys';

export type CreatedCategory = {
  category: Category;
  /** True when the name was taken (409) and the existing visible category was picked instead. */
  existed: boolean;
};

/**
 * A close mirror of the API's slug (`@sindresorhus/slugify`) for plain names: lower case,
 * accents dropped, other characters collapsed to `-`. Used only to recognise the category a
 * 409 refers to; without a match the problem is shown instead.
 */
export function nameToSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function findSameCategory(
  categories: readonly Category[],
  name: string,
): Category | undefined {
  const wanted = name.trim().toLocaleLowerCase();
  const slug = nameToSlug(name);
  return categories.find((c) => c.slug === slug || c.name.trim().toLocaleLowerCase() === wanted);
}

/**
 * US6 / R9: inline category create from the editor (`POST /decks/{id}/categories { name }`,
 * shared visibility by default). A 409 selects the same-named visible category from a fresh
 * list; the deck's category lists refetch either way.
 */
export function useCreateCategory(deck: Pick<Deck, 'id' | 'slug'>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<CreatedCategory> => {
      try {
        const category = await unwrap(
          api.POST('/decks/{id}/categories', {
            params: { path: { id: deck.id } },
            body: { name },
          }),
        );
        return { category, existed: false };
      } catch (error) {
        if (!isApiError(error) || error.status !== 409) throw error;
        const fresh = await qc.fetchQuery({ ...categoriesQuery(deck.id), staleTime: 0 });
        const existing = findSameCategory(fresh, name);
        if (!existing) throw error;
        return { category: existing, existed: true };
      }
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.categories(deck.id) }),
        qc.invalidateQueries({ queryKey: queryKeys.categories(deck.slug) }),
      ]),
  });
}
