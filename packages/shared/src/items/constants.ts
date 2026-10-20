/**
 * Phase 6 card lifecycle constants (D132). The API, worker and web read these, never literals.
 * Web imports them from the `@pb/shared/item-constants` subpath (bundle budget).
 */

/** D132: a deleted card can be undeleted for this many days; the weekly purge removes it after. */
export const ITEM_UNDELETE_DAYS = 30;

/** D132: weekly hard purge of cards deleted more than ITEM_UNDELETE_DAYS ago (Sunday 05:00). */
export const DELETED_ITEM_PRUNE_CRON = '0 5 * * 0';
