import { MEDIA_DELETE_CHUNK, MEDIA_ORPHAN_GRACE_DAYS, MEDIA_SWEEP_BATCH } from '@gobbit/shared';
import type { Logger } from '../lib/logger';
import { deckPrefixes, type MediaStore } from '../media/media-store';
import type { AssetsRepo } from '../repositories/assets.repo';

const DAY_MS = 86_400_000;

export interface SweepSummary {
  deleted: number;
  notFound: number;
  failed: number;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * D158: the database decides what is an orphan; the store is only asked to delete by id. It is
 * never listed.
 */
export function createOrphanSweeper(deps: {
  assets: Pick<AssetsRepo, 'orphans' | 'deleteByIds'>;
  store: MediaStore | null;
  log: Logger;
}) {
  const { assets, store, log } = deps;

  return {
    async sweepOrphans(input: { now: Date }): Promise<SweepSummary> {
      const summary: SweepSummary = { deleted: 0, notFound: 0, failed: 0 };
      if (!store) return summary;
      const cutoff = new Date(input.now.getTime() - MEDIA_ORPHAN_GRACE_DAYS * DAY_MS);
      const orphans = await assets.orphans(cutoff, MEDIA_SWEEP_BATCH);

      for (const group of chunk(orphans, MEDIA_DELETE_CHUNK)) {
        const outcomes = await store.deleteMany(group.map((o) => o.publicId));
        const gone: string[] = [];
        for (const orphan of group) {
          const outcome = outcomes.get(orphan.publicId) ?? 'failed';
          if (outcome === 'failed') {
            summary.failed += 1;
            continue;
          }
          if (outcome === 'deleted') summary.deleted += 1;
          else summary.notFound += 1;
          gone.push(orphan.id);
        }
        await assets.deleteByIds(gone);
      }

      log.info({ ...summary, candidates: orphans.length }, 'media sweep finished');
      return summary;
    },

    async deleteForDeck(deckId: string): Promise<void> {
      if (!store) return;
      for (const prefix of deckPrefixes(deckId)) {
        try {
          await store.deleteByPrefix(prefix);
        } catch (err) {
          log.warn({ deckId, prefix, err: (err as Error).message }, 'deck image cleanup failed');
        }
      }
    },
  };
}
