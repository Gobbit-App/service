import type { Category } from '@pb/shared';

/** Category view type: all, favorites, archived, or a specific category. */
export type ChipView =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'archived' }
  | { kind: 'category'; slug: string };

/** Sort categories: default first, then by position, then by name. */
export function orderChips(categories: readonly Category[]): Category[] {
  const arr = [...categories];
  arr.sort((a, b) => {
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? -1 : 1;
    }
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    return a.name.localeCompare(b.name);
  });
  return arr;
}

/** Build href for a chip view. */
export function chipHref(deckSlug: string, view: ChipView): string {
  const encoded = encodeURIComponent(deckSlug);
  switch (view.kind) {
    case 'all':
      return `/d/${encoded}`;
    case 'favorites':
      return `/d/${encoded}/favorites`;
    case 'archived':
      return `/d/${encoded}/archived`;
    case 'category':
      return `/d/${encoded}/c/${encodeURIComponent(view.slug)}`;
  }
}

/** Parse pathname to extract deck slug and view, or null if invalid. */
export function viewFromPath(pathname: string): { deckSlug: string; view: ChipView } | null {
  const path = pathname.replace(/^\/+|\/+$/g, '');

  const allMatch = path.match(/^d\/([^/]+)$/);
  if (allMatch) {
    return {
      deckSlug: decodeURIComponent(allMatch[1]),
      view: { kind: 'all' },
    };
  }

  const favMatch = path.match(/^d\/([^/]+)\/favorites$/);
  if (favMatch) {
    return {
      deckSlug: decodeURIComponent(favMatch[1]),
      view: { kind: 'favorites' },
    };
  }

  const archMatch = path.match(/^d\/([^/]+)\/archived$/);
  if (archMatch) {
    return {
      deckSlug: decodeURIComponent(archMatch[1]),
      view: { kind: 'archived' },
    };
  }

  const catMatch = path.match(/^d\/([^/]+)\/c\/([^/]+)$/);
  if (catMatch) {
    return {
      deckSlug: decodeURIComponent(catMatch[1]),
      view: {
        kind: 'category',
        slug: decodeURIComponent(catMatch[2]),
      },
    };
  }

  return null;
}

/** Check if two views are the same. */
export function sameView(a: ChipView, b: ChipView): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'category' && b.kind === 'category') {
    return a.slug === b.slug;
  }
  return true;
}
