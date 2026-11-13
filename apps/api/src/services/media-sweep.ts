import {
  MEDIA_DELETE_CHUNK,
  MEDIA_ORPHAN_GRACE_DAYS,
  MEDIA_SWEEP_BATCH,
  MEDIA_VERIFY_BATCH,
  kindForFormat,
  resourceTypeForKind,
  type AssetResourceType,
  type MediaKind,
  type MediaMaxBytes,
} from '@gobbit/shared';
import type { Logger } from '../lib/logger';
import { deckPrefixes, type MediaStore } from '../media/media-store';
import type { AssetsRepo, OrphanAsset } from '../repositories/assets.repo';

const DAY_MS = 86_400_000;

export interface SweepSummary {
  deleted: number;
  notFound: number;
  failed: number;
  /** 045: files deleted per kind (`media.sweep`). */
  byKind?: Partial<Record<MediaKind, number>>;
}

/** D390: what the verify pass found. */
export interface VerifySummary {
  verified: number;
  refused: number;
  missing: number;
  failed: number;
}

/** Why the verify pass refused a recorded file (plan Accountability: `media.verify`). */
export type VerifyRefusal = 'too_large' | 'format' | 'resource_type';

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * D158: the database decides what is an orphan; the store is only asked to delete by id. It is
 * never listed. D388: ids are deleted under their own resource type.
 */
export function createOrphanSweeper(deps: {
  assets: Pick<AssetsRepo, 'orphans' | 'deleteByIds'> &
    Partial<Pick<AssetsRepo, 'unverified' | 'markVerified' | 'markRejected'>>;
  store: MediaStore | null;
  log: Logger;
  /** D393: limits the verify pass enforces; without them it only checks format and type. */
  maxBytes?: MediaMaxBytes;
  verifyBatch?: number;
}) {
  const { assets, store, log } = deps;

  return {
    async sweepOrphans(input: { now: Date; jobId?: string }): Promise<SweepSummary> {
      const summary: SweepSummary = { deleted: 0, notFound: 0, failed: 0, byKind: {} };
      if (!store) return summary;
      const cutoff = new Date(input.now.getTime() - MEDIA_ORPHAN_GRACE_DAYS * DAY_MS);
      const orphans = await assets.orphans(cutoff, MEDIA_SWEEP_BATCH);

      const byType = new Map<AssetResourceType, OrphanAsset[]>();
      for (const orphan of orphans) {
        const type = orphan.resourceType ?? 'image';
        byType.set(type, [...(byType.get(type) ?? []), orphan]);
      }

      for (const [resourceType, list] of byType) {
        for (const group of chunk(list, MEDIA_DELETE_CHUNK)) {
          const outcomes = await store.deleteMany(
            group.map((o) => o.publicId),
            resourceType,
          );
          const gone: string[] = [];
          for (const orphan of group) {
            const outcome = outcomes.get(orphan.publicId) ?? 'failed';
            if (outcome === 'failed') {
              summary.failed += 1;
              continue;
            }
            if (outcome === 'deleted') {
              summary.deleted += 1;
              const kind = orphan.kind ?? 'image';
              summary.byKind![kind] = (summary.byKind![kind] ?? 0) + 1;
            } else summary.notFound += 1;
            gone.push(orphan.id);
          }
          await assets.deleteByIds(gone);
        }
      }

      const level = summary.failed > 0 ? 'error' : 'info';
      log[level](
        {
          event: 'media.sweep',
          outcome: summary.failed > 0 ? 'failed' : 'deleted',
          jobId: input.jobId ?? 'internal',
          ...summary,
          candidates: orphans.length,
        },
        'media.sweep',
      );
      return summary;
    },

    /**
     * D390: checks editor uploads' forwarded facts against the provider. A file over its kind's
     * limit, in a format no kind allows, or stored as another resource type is deleted and its
     * asset marked rejected (cards then show it as unavailable). A file the provider doesn't know
     * is logged `missing` and left alone. Never throws for one file.
     */
    async verifyRecent(input: { now: Date; jobId?: string }): Promise<VerifySummary> {
      const summary: VerifySummary = { verified: 0, refused: 0, missing: 0, failed: 0 };
      if (!store || !assets.unverified || !assets.markVerified || !assets.markRejected) {
        return summary;
      }
      const jobId = input.jobId ?? 'internal';
      const batch = await assets.unverified(deps.verifyBatch ?? MEDIA_VERIFY_BATCH);

      for (const asset of batch) {
        const fields = { jobId, assetId: asset.id, deckId: asset.deckId, kind: asset.kind };
        try {
          const found = await store.resource(asset.publicId, asset.resourceType);
          if (!found) {
            summary.missing += 1;
            log.info({ event: 'media.verify', outcome: 'missing', ...fields }, 'media.verify');
            await assets.markVerified(asset.id, input.now);
            continue;
          }
          const reason = refusal(asset.kind, found, deps.maxBytes);
          if (!reason) {
            summary.verified += 1;
            await assets.markVerified(asset.id, input.now);
            continue;
          }
          const outcome = await store.deleteMany([asset.publicId], asset.resourceType);
          const deleted = outcome.get(asset.publicId);
          if (deleted === 'failed' || deleted === undefined) {
            summary.failed += 1;
            log.error(
              { event: 'media.verify', outcome: 'refused', reason, deleteFailed: true, ...fields },
              'media.verify',
            );
            continue;
          }
          await assets.markRejected(asset.id, input.now);
          summary.refused += 1;
          log.warn(
            { event: 'media.verify', outcome: 'refused', reason, ...fields },
            'media.verify',
          );
        } catch (err) {
          summary.failed += 1;
          log.error(
            { event: 'media.verify', outcome: 'error', err: (err as Error).message, ...fields },
            'media.verify',
          );
        }
      }
      return summary;
    },

    async deleteForDeck(deckId: string): Promise<void> {
      if (!store) return;
      for (const prefix of deckPrefixes(deckId)) {
        try {
          await store.deleteByPrefix(prefix);
        } catch (err) {
          log.warn({ deckId, prefix, err: (err as Error).message }, 'deck media cleanup failed');
        }
      }
    },
  };
}

/** D390: the reason a stored file breaks the recorded kind's rules, or null when it doesn't. */
export function refusal(
  kind: MediaKind,
  found: { resourceType: AssetResourceType; format: string; bytes: number },
  maxBytes?: MediaMaxBytes,
): VerifyRefusal | null {
  if (kindForFormat(found.format) !== kind) return 'format';
  const expected = resourceTypeForKind(kind);
  if (found.resourceType !== expected) return 'resource_type';
  if (maxBytes && found.bytes > maxBytes[kind]) return 'too_large';
  return null;
}
