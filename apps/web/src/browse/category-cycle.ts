import type { Category } from '@gobbit/shared';
import { orderChips } from '../ui/chip-order';
import { ALL_CATEGORIES } from './browse-params';

/** One stop of the header cycle: All or a category. */
export interface CycleEntry {
  /** `'all'` or the category slug (the `c` param). */
  slug: string;
  name: string;
}

/**
 * D141: All, then the categories in chip-row order. Favorites and Archived are views, not
 * categories, so they are never part of the cycle.
 */
export function categoryCycle(categories: readonly Category[]): CycleEntry[] {
  return [
    { slug: ALL_CATEGORIES, name: 'All' },
    ...orderChips(categories)
      .filter((category) => category.slug !== ALL_CATEGORIES)
      .map((category) => ({ slug: category.slug, name: category.name })),
  ];
}

/** An unknown slug (deleted, hidden, mistyped) falls back to All. */
export function resolveCategory(cycle: readonly CycleEntry[], c: string): string {
  return cycle.some((entry) => entry.slug === c) ? c : ALL_CATEGORIES;
}

/** The neighbour in the cycle, or null at either end (no wrap-around). */
export function stepCategory(
  cycle: readonly CycleEntry[],
  c: string,
  direction: 'next' | 'prev',
): CycleEntry | null {
  const index = cycle.findIndex((entry) => entry.slug === resolveCategory(cycle, c));
  const target = direction === 'next' ? index + 1 : index - 1;
  return cycle[target] ?? null;
}
