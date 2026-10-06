import type { CategoryVisibility, ItemStatus } from '@pb/shared';

/** Describes a shareable item's visibility context. */
export type ShareSubject = {
  status: ItemStatus;
  deletedAt: Date | null;
  deckIsPublic: boolean;
  categoryVisibilities: readonly CategoryVisibility[];
};

/** Public or private share mode. */
export type ShareMode = 'public' | 'private';

/** Determines share mode based on subject visibility criteria. */
export function shareMode(subject: ShareSubject | null): ShareMode {
  if (subject === null) {
    return 'private';
  }

  const isPublic =
    subject.status === 'published' &&
    subject.deletedAt === null &&
    subject.deckIsPublic &&
    subject.categoryVisibilities.includes('public');

  return isPublic ? 'public' : 'private';
}
