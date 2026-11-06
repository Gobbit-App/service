import type { ItemRow } from '@gobbit/db';
import {
  LINK_IMAGE_CANDIDATES_MAX,
  LINK_IMAGE_RULES_VERSION,
  type LinkPayload,
} from '@gobbit/shared';
import { lineSink } from '../lib/logger';
import { LINK_SNAPSHOT_SEND_OPTIONS, QUEUES, type JobSender, type LinkSnapshotJob } from './queues';

export type SnapshotCandidate = Pick<ItemRow, 'id' | 'type' | 'status' | 'payload' | 'deletedAt'>;

/** Called after a write commits (D163). Never throws. */
export interface LinkSnapshotQueue {
  enqueueIfNeeded(row: SnapshotCandidate, opts?: { candidates?: string[] }): Promise<void>;
}

/** Without image storage there is nothing to copy into, so nothing is enqueued (FR-013). */
export const noopLinkSnapshotQueue: LinkSnapshotQueue = {
  async enqueueIfNeeded() {},
};

/**
 * D163/D350: a live link card needs the job when its preview is still empty (the job fills it
 * first), when its preview image has no stored copy yet, or when it has text but no image and was
 * not yet looked at under the current image rules. A member's "Remove photo" is final.
 */
export function needsLinkSnapshot(row: Omit<SnapshotCandidate, 'id'>): boolean {
  if (row.type !== 'link' || row.deletedAt) return false;
  if (row.status !== 'proposed' && row.status !== 'published') return false;
  const preview = (row.payload as LinkPayload).preview;
  if (!preview?.title && !preview?.description && !preview?.image) return true;
  if (preview.publicId) return false;
  if (preview.image) return true;
  return !preview.imageRemoved && (preview.imageLookup ?? 0) < LINK_IMAGE_RULES_VERSION;
}

export function createLinkSnapshotQueue(deps: {
  sender: JobSender;
  log?: (message: string) => void;
}): LinkSnapshotQueue {
  const { sender, log = lineSink('link-snapshot-queue') } = deps;

  return {
    async enqueueIfNeeded(row, opts) {
      if (!needsLinkSnapshot(row)) return;
      try {
        const candidates = opts?.candidates?.slice(0, LINK_IMAGE_CANDIDATES_MAX);
        const data: LinkSnapshotJob = {
          itemId: row.id,
          ...(candidates?.length ? { candidates } : {}),
        };
        await sender.send(QUEUES.linkSnapshot, data, {
          singletonKey: row.id,
          ...LINK_SNAPSHOT_SEND_OPTIONS,
        });
      } catch (err) {
        // The backfill script heals misses; a write must not fail on the queue.
        log(
          `[link-snapshot-queue] enqueue failed for ${row.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    },
  };
}
