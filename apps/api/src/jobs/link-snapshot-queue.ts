import type { ItemRow } from '@gobbit/db';
import type { LinkPayload } from '@gobbit/shared';
import { lineSink } from '../lib/logger';
import { LINK_SNAPSHOT_SEND_OPTIONS, QUEUES, type JobSender, type LinkSnapshotJob } from './queues';

export type SnapshotCandidate = Pick<ItemRow, 'id' | 'type' | 'status' | 'payload' | 'deletedAt'>;

/** Called after a write commits (D163). Never throws. */
export interface LinkSnapshotQueue {
  enqueueIfNeeded(row: SnapshotCandidate): Promise<void>;
}

/** Without image storage there is nothing to copy into, so nothing is enqueued (FR-013). */
export const noopLinkSnapshotQueue: LinkSnapshotQueue = {
  async enqueueIfNeeded() {},
};

/**
 * D163: a live link card needs the job when its preview image has no stored copy yet, or when
 * the preview is still empty (the job fills it first).
 */
export function needsLinkSnapshot(row: Omit<SnapshotCandidate, 'id'>): boolean {
  if (row.type !== 'link' || row.deletedAt) return false;
  if (row.status !== 'proposed' && row.status !== 'published') return false;
  const preview = (row.payload as LinkPayload).preview;
  if (!preview?.title && !preview?.description && !preview?.image) return true;
  return Boolean(preview.image) && !preview.publicId;
}

export function createLinkSnapshotQueue(deps: {
  sender: JobSender;
  log?: (message: string) => void;
}): LinkSnapshotQueue {
  const { sender, log = lineSink('link-snapshot-queue') } = deps;

  return {
    async enqueueIfNeeded(row) {
      if (!needsLinkSnapshot(row)) return;
      try {
        const data: LinkSnapshotJob = { itemId: row.id };
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
