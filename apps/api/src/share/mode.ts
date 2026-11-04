import type { CategoryVisibility, ItemStatus, ItemType } from '@gobbit/shared';

/** Describes a shareable item's visibility context. */
export type ShareSubject = {
  /** D292: reminders are never public (omitted = an ordinary card). */
  type?: ItemType;
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
    subject.type !== 'reminder' &&
    subject.status === 'published' &&
    subject.deletedAt === null &&
    subject.deckIsPublic &&
    subject.categoryVisibilities.includes('public');

  return isPublic ? 'public' : 'private';
}
