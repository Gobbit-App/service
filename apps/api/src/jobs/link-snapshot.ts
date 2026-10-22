import type { ItemRow } from '@pb/db';
import { LINK_SNAPSHOT_REQUEUE_MAX, type LinkPayload, type LinkPreview } from '@pb/shared';
import { lockedHostOf, type LockedHostMatch } from '@pb/shared/links';
import { isGenericLockedPreview } from '../fetch/locked-host-preview';
import type { Logger } from '../lib/logger';
import type { ItemsRepo } from '../repositories/items.repo';
import type { UploadFromUrlResult } from '../services/media-upload-from-url';
import type { EmbedQueue } from './embed-queue';
import { needsLinkSnapshot } from './link-snapshot-queue';
import { LINK_SNAPSHOT_SEND_OPTIONS, QUEUES, type JobSender, type LinkSnapshotJob } from './queues';

export type LinkSnapshotOutcome =
  /** The row is gone, not a link, not live, or already has its copy. */
  | 'skipped'
  /** Nothing to write: no preview found and no image to copy. */
  | 'unchanged'
  | 'written'
  /** An edit landed meanwhile; the job was sent again. */
  | 'requeued'
  /** An edit landed meanwhile and the requeue budget is spent. */
  | 'superseded';

type Payload = LinkPayload;
type Preview = NonNullable<Payload['preview']>;

function isEmpty(preview: Preview | undefined): boolean {
  return !preview?.title && !preview?.description && !preview?.image;
}

/**
 * D163: fill an empty preview, copy `preview.image` into image storage and write the server-owned
 * `preview.publicId`/`width`/`height`, never over a newer edit. Fetch and upload failures are
 * logged, never thrown (the card keeps its remote image). A set `publicId` is never replaced.
 *
 * D168, locked social hosts: one try only (no requeue after an edit), a preview that only names
 * the site is discarded, and failures stay quiet (the host refuses servers by design).
 */
export function createLinkSnapshotHandler(deps: {
  items: Pick<ItemsRepo, 'findById' | 'updatePayloadIf'>;
  fetchPreview: (url: string) => Promise<LinkPreview | null>;
  /** Null without image storage: previews are still filled, nothing is copied. */
  uploadFromUrl:
    | ((input: {
        deckId: string;
        url: string;
        source: 'link_snapshot';
      }) => Promise<UploadFromUrlResult>)
    | null;
  sender: JobSender;
  embedQueue: Pick<EmbedQueue, 'enqueueIfStale'>;
  log: Pick<Logger, 'info' | 'warn'>;
}) {
  const { items, fetchPreview, uploadFromUrl, sender, embedQueue, log } = deps;

  async function nextPreview(
    row: ItemRow,
    locked: LockedHostMatch | null,
  ): Promise<Preview | undefined> {
    const payload = row.payload as Payload;
    let preview = payload.preview;
    if (isEmpty(preview)) {
      const found = await fetchPreview(payload.url);
      if (found && !(locked && isGenericLockedPreview(found, locked))) {
        preview = { ...preview, ...found };
      }
    }
    if (!preview?.image || preview.publicId || !uploadFromUrl) return preview;

    const copied = await uploadFromUrl({
      deckId: row.deckId,
      url: preview.image,
      source: 'link_snapshot',
    });
    if (!copied.asset) {
      if (!locked) log.info({ itemId: row.id, reason: copied.reason }, 'link snapshot not copied');
      return preview;
    }
    const { publicId, width, height } = copied.asset;
    return {
      ...preview,
      publicId,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    };
  }

  return async function linkSnapshot(job: LinkSnapshotJob): Promise<LinkSnapshotOutcome> {
    const row = await items.findById(job.itemId);
    if (!row || !needsLinkSnapshot(row)) return 'skipped';

    const payload = row.payload as Payload;
    const locked = lockedHostOf(payload.url);
    const preview = await nextPreview(row, locked);
    if (!preview || JSON.stringify(preview) === JSON.stringify(payload.preview)) {
      return 'unchanged';
    }

    const written = await items.updatePayloadIf(row.id, row.updatedAt, { ...payload, preview });
    if (!written) {
      const attempt = job.attempt ?? 0;
      if (locked || attempt >= LINK_SNAPSHOT_REQUEUE_MAX) {
        log.info({ itemId: row.id }, 'link snapshot superseded by an edit');
        return 'superseded';
      }
      try {
        const data: LinkSnapshotJob = { itemId: row.id, attempt: attempt + 1 };
        await sender.send(QUEUES.linkSnapshot, data, {
          singletonKey: row.id,
          ...LINK_SNAPSHOT_SEND_OPTIONS,
        });
      } catch (err) {
        log.warn({ itemId: row.id, err: (err as Error).message }, 'link snapshot requeue failed');
      }
      return 'requeued';
    }

    // A filled title or description changes the searchable text (D72).
    await embedQueue.enqueueIfStale(row.id);
    return 'written';
  };
}
