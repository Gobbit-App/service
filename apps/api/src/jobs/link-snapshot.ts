import type { ItemRow } from '@gobbit/db';
import {
  LINK_IMAGE_MIN_STORED_PX,
  LINK_IMAGE_RULES_VERSION,
  LINK_IMAGE_TRIES,
  LINK_SNAPSHOT_REQUEUE_MAX,
  type LinkPayload,
} from '@gobbit/shared';
import { lockedHostOf } from '@gobbit/shared/links';
import { logPreviewBuilt, type PreviewBuild } from '../fetch/build-preview';
import { PREVIEW_EVENTS, previewHost, type SnapshotImageOutcome } from '../fetch/preview-events';
import type { Logger } from '../lib/logger';
import type { ItemsRepo } from '../repositories/items.repo';
import type { UploadFromUrlReason, UploadFromUrlResult } from '../services/media-upload-from-url';
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

type Preview = NonNullable<LinkPayload['preview']>;
type SnapshotLog = Pick<Logger, 'info' | 'warn'>;
type UploadFromUrl = (input: {
  deckId: string;
  url: string;
  source: 'link_snapshot';
}) => Promise<UploadFromUrlResult>;

/** Our storage failed, not the image: the card keeps its remote image, unstamped (D349). */
const STORAGE_FAILURES = new Set<UploadFromUrlReason>(['upload_failed', 'unavailable']);

export interface LinkSnapshotDeps {
  items: Pick<ItemsRepo, 'findById' | 'updatePayloadIf'>;
  /** D346: the shared builder; called at most once per run, and only when the job must look. */
  buildPreview: (url: string, log?: SnapshotLog) => Promise<PreviewBuild>;
  /** Null without image storage: previews are still filled, nothing is copied. */
  uploadFromUrl: UploadFromUrl | null;
  sender: JobSender;
  embedQueue: Pick<EmbedQueue, 'enqueueIfStale'>;
  log: SnapshotLog;
  /** D349: candidates tried before the image is dropped (env `LINK_IMAGE_TRIES`). */
  imageTries?: number;
  /** D349: a stored copy narrower than this, or shorter than half of it, is too small. */
  minStoredPx?: number;
}

interface ImageResult {
  preview: Preview;
  outcome: SnapshotImageOutcome | null;
  reason?: string;
  tries: number;
}

function isEmpty(preview: Preview | undefined): boolean {
  return !preview?.title && !preview?.description && !preview?.image;
}

function hasText(preview: Preview): boolean {
  return Boolean(preview.title || preview.description);
}

function withoutImage(preview: Preview): Preview {
  const { image: _image, ...rest } = preview;
  return rest;
}

function unique(urls: readonly (string | undefined)[]): string[] {
  return [...new Set(urls.filter((u): u is string => Boolean(u)))];
}

/**
 * D163/D349: fill an empty preview, then copy the preview image into image storage, trying the
 * page's other image candidates when one fails, and write the server-owned `publicId`/`width`/
 * `height` and `imageLookup`, never over a newer edit. Failures are logged, never thrown. A set
 * `publicId` is never replaced and a member's "Remove photo" (`imageRemoved`) is never undone.
 *
 * D168: locked social hosts get one try only (no requeue after an edit).
 */
export function createLinkSnapshotHandler(deps: LinkSnapshotDeps) {
  const { items, uploadFromUrl, sender, embedQueue, log } = deps;
  const imageTries = Math.max(1, deps.imageTries ?? LINK_IMAGE_TRIES);
  const minStoredPx = deps.minStoredPx ?? LINK_IMAGE_MIN_STORED_PX;

  function tooSmall(asset: { width: number | null; height: number | null }): boolean {
    return (asset.width ?? 0) < minStoredPx || (asset.height ?? 0) < minStoredPx / 2;
  }

  return async function linkSnapshot(
    job: LinkSnapshotJob,
    ctx: { jobId?: string } = {},
  ): Promise<LinkSnapshotOutcome> {
    const row = await items.findById(job.itemId);
    if (!row || !needsLinkSnapshot(row)) return 'skipped';

    const payload = row.payload as LinkPayload;
    const ids = { jobId: ctx.jobId, itemId: row.id, deckId: row.deckId };
    const removed = Boolean(payload.preview?.imageRemoved);

    let build: PreviewBuild | null = null;
    async function buildOnce(): Promise<PreviewBuild> {
      if (!build) {
        build = await deps.buildPreview(payload.url, log);
        logPreviewBuilt(log, 'snapshot', build.decision, ids);
      }
      return build;
    }

    let preview: Preview = { ...payload.preview };
    if (isEmpty(payload.preview)) {
      const found = (await buildOnce()).preview;
      if (found) preview = { ...preview, ...(removed ? withoutImage(found) : found) };
    }

    const image = removed
      ? { preview, outcome: 'member_choice' as const, tries: 0 }
      : await nextImage(row, preview, job.candidates, buildOnce);
    if (image.outcome) logImage(image, ids, payload.url);

    if (
      isEmpty(image.preview) ||
      JSON.stringify(image.preview) === JSON.stringify(payload.preview)
    ) {
      return 'unchanged';
    }
    return write(row, job, { ...payload, preview: image.preview });
  };

  /**
   * D349: try up to `imageTries` candidates, the card's own image first. Ingest's candidates come
   * with the job; otherwise the page is built once, when a lookup is due or the first copy failed.
   */
  async function nextImage(
    row: ItemRow,
    preview: Preview,
    jobCandidates: string[] | undefined,
    buildOnce: () => Promise<PreviewBuild>,
  ): Promise<ImageResult> {
    if (preview.publicId) return { preview, outcome: null, tries: 0 };
    const lookupDue = !preview.image && (preview.imageLookup ?? 0) < LINK_IMAGE_RULES_VERSION;
    if (!preview.image && !lookupDue) return { preview, outcome: null, tries: 0 };

    let candidates = jobCandidates;
    const queue = unique([preview.image, ...(candidates ?? [])]);
    if (queue.length === 0 && !candidates) {
      candidates = (await buildOnce()).candidates;
      queue.push(...unique(candidates));
    }
    if (queue.length === 0) {
      // Nothing to try: remember the look so the card is not looked at again (D350).
      const stamped = hasText(preview)
        ? { ...preview, imageLookup: LINK_IMAGE_RULES_VERSION }
        : preview;
      return { preview: stamped, outcome: 'none', tries: 0 };
    }
    if (!uploadFromUrl) return keep(preview, queue[0]!, 'unavailable', 0);

    let tries = 0;
    let reason: string | undefined;
    while (tries < imageTries && tries < queue.length) {
      const url = queue[tries]!;
      tries += 1;
      const copied = await uploadFromUrl({ deckId: row.deckId, url, source: 'link_snapshot' });
      if (copied.asset && !tooSmall(copied.asset)) {
        const { publicId, width, height } = copied.asset;
        return {
          preview: {
            ...preview,
            image: url,
            publicId,
            ...(width ? { width } : {}),
            ...(height ? { height } : {}),
            imageLookup: LINK_IMAGE_RULES_VERSION,
          },
          outcome: 'copied',
          tries,
        };
      }
      if (!copied.asset && STORAGE_FAILURES.has(copied.reason)) {
        return keep(preview, url, copied.reason, tries);
      }
      // The too-small copy stays unreferenced; media-sweep removes it (ADR-054).
      reason = copied.asset ? 'too_small' : copied.reason;
      if (tries === queue.length && !candidates) {
        candidates = (await buildOnce()).candidates;
        queue.push(...unique(candidates).filter((u) => !queue.includes(u)));
      }
    }

    // FR-013: every tried image failed; drop it rather than show a broken picture.
    return {
      preview: { ...withoutImage(preview), imageLookup: LINK_IMAGE_RULES_VERSION },
      outcome: 'dropped',
      reason,
      tries,
    };
  }

  function keep(preview: Preview, url: string, reason: string, tries: number): ImageResult {
    return { preview: { ...preview, image: preview.image ?? url }, outcome: 'kept', reason, tries };
  }

  function logImage(
    image: ImageResult,
    ids: { jobId?: string; itemId: string; deckId: string },
    url: string,
  ): void {
    const fields = {
      event: PREVIEW_EVENTS.snapshotImage,
      outcome: image.outcome,
      ...(image.reason ? { reason: image.reason } : {}),
      ...ids,
      host: previewHost(url),
      tries: image.tries,
    };
    if (image.outcome === 'dropped') log.warn(fields, 'link snapshot image dropped');
    else log.info(fields, 'link snapshot image');
  }

  async function write(
    row: ItemRow,
    job: LinkSnapshotJob,
    next: LinkPayload,
  ): Promise<LinkSnapshotOutcome> {
    const written = await items.updatePayloadIf(row.id, row.updatedAt, next);
    if (written) {
      // A filled title or description changes the searchable text (D72).
      await embedQueue.enqueueIfStale(row.id);
      return 'written';
    }

    const attempt = job.attempt ?? 0;
    if (lockedHostOf(next.url) || attempt >= LINK_SNAPSHOT_REQUEUE_MAX) {
      log.info({ itemId: row.id }, 'link snapshot superseded by an edit');
      return 'superseded';
    }
    try {
      const data: LinkSnapshotJob = { ...job, attempt: attempt + 1 };
      await sender.send(QUEUES.linkSnapshot, data, {
        singletonKey: row.id,
        ...LINK_SNAPSHOT_SEND_OPTIONS,
      });
    } catch (err) {
      log.warn({ itemId: row.id, err: (err as Error).message }, 'link snapshot requeue failed');
    }
    return 'requeued';
  }
}
