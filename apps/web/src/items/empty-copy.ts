import type { ItemFilter } from '../api/query-keys';

/** What an empty list says, per view. */
export function emptyListCopy(filter: ItemFilter): { title: string; body: string } {
  switch (filter.kind) {
    case 'favorites':
      return { title: 'No favorites yet', body: 'Tap the star on a card to keep it here.' };
    case 'archived':
      return { title: 'Nothing archived', body: 'Archived cards show up here.' };
    case 'links':
      return {
        title: 'No links to check',
        body: 'Links that may be dead or changed show up here.',
      };
    case 'deleted':
      return { title: 'Nothing deleted', body: 'Deleted cards stay here for 30 days.' };
    case 'category':
      return { title: 'No cards here yet', body: 'This category has no cards yet.' };
    case 'all':
      return { title: 'No cards yet', body: 'Cards added to this deck will show up here.' };
  }
}
