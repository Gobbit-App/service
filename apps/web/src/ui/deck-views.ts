import type { Category } from '@gobbit/shared';
import { orderChips, type ChipView } from './chip-order';

/** Which role-gated views a deck shows besides All, Favorites and its categories. */
export interface DeckViewOptions {
  /** `item.archive` roles see Archived. */
  showArchived: boolean;
  /** D165: `item.update` roles see "Links to check". */
  showLinks: boolean;
}

/** A deck's list views in display order: All, Favorites, categories, then Archived and Links. */
export function deckViews(
  categories: readonly Category[],
  { showArchived, showLinks }: DeckViewOptions,
): ChipView[] {
  const views: ChipView[] = [
    { kind: 'all' },
    { kind: 'favorites' },
    ...orderChips(categories).map((cat) => ({ kind: 'category' as const, slug: cat.slug })),
  ];
  if (showArchived) views.push({ kind: 'archived' });
  if (showLinks) views.push({ kind: 'links' });
  return views;
}

const FIXED_LABELS = {
  all: 'All',
  favorites: 'Favorites',
  archived: 'Archived',
  links: 'Links to check',
} as const;

/** The name a view goes by; a category not (yet) loaded falls back to its slug. */
export function viewLabel(view: ChipView, categories: readonly Category[]): string {
  if (view.kind !== 'category') return FIXED_LABELS[view.kind];
  return categories.find((c) => c.slug === view.slug)?.name ?? view.slug;
}
