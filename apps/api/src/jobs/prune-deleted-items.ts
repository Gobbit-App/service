import { ITEM_UNDELETE_DAYS } from '@pb/shared';
import type { ItemsRepo } from '../repositories/items.repo';

const DAY_MS = 86_400_000;

/**
 * D132: hard-deletes cards soft-deleted more than the undo window ago (weekly, singleton).
 * Item FKs cascade (categories, favorites, embeddings) or set null (ingest_jobs.result_item_id).
 * Returns and logs the number of rows removed.
 */
export function createPruneDeletedItems(deps: {
  items: Pick<ItemsRepo, 'purgeDeletedBefore'>;
  now?: () => Date;
  undeleteDays?: number;
  log?: (msg: string) => void;
}) {
  const {
    items,
    now = () => new Date(),
    undeleteDays = ITEM_UNDELETE_DAYS,
    log = (msg) => console.log(msg),
  } = deps;

  return async function pruneDeletedItems(): Promise<number> {
    const cutoff = new Date(now().getTime() - undeleteDays * DAY_MS);
    const purged = await items.purgeDeletedBefore(cutoff);
    log(`[worker] purged ${purged} deleted items (deleted before ${cutoff.toISOString()})`);
    return purged;
  };
}
