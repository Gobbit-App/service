import { randomUUID } from 'node:crypto';
import { LINK_IMAGE_BACKFILL_HOST_SPACING_S, LINK_IMAGE_RULES_VERSION } from '@gobbit/shared';
import { previewHost } from '../fetch/preview-events';
import type { Logger } from '../lib/logger';
import type { ItemsRepo } from '../repositories/items.repo';
import { LINK_SNAPSHOT_SEND_OPTIONS, QUEUES, type JobSender, type LinkSnapshotJob } from './queues';

export const BACKFILL_EVENT = 'link_snapshot.backfill';

const BATCH = 100;

export interface ImageBackfillDeps {
  items: Pick<ItemsRepo, 'linkImageBackfillCandidates'>;
  sender: JobSender;
  log: Pick<Logger, 'info'>;
  /** Pause between batches (ms); the script waits a second like the 014 backfill. */
  pause?: () => Promise<void>;
  /** Dry-run listing, one line per card that would be enqueued. */
  print?: (line: string) => void;
}

export interface ImageBackfillOptions {
  dryRun?: boolean;
  /** Seconds between two jobs for the same host (FR-015). */
  hostSpacingS?: number;
  batch?: number;
}

export interface ImageBackfillSummary {
  runId: string;
  scanned: number;
  enqueued: number;
  skippedMemberEdit: number;
  hosts: number;
}

/**
 * D351: enqueue `link-snapshot` once for every live link card with text but no image that was
 * not looked at under the current rules, spacing each host's jobs `hostSpacingS` apart so a host
 * sees at most one request per spacing. Cards a member ever payload-edited are skipped (a removal
 * before 041 left no marker). Jobs are singletons per card, so a rerun enqueues none.
 */
export async function runImageBackfill(
  deps: ImageBackfillDeps,
  opts: ImageBackfillOptions = {},
): Promise<ImageBackfillSummary> {
  const spacing = Math.max(0, opts.hostSpacingS ?? LINK_IMAGE_BACKFILL_HOST_SPACING_S);
  const batch = opts.batch ?? BATCH;
  const perHost = new Map<string, number>();
  const summary: ImageBackfillSummary = {
    runId: randomUUID(),
    scanned: 0,
    enqueued: 0,
    skippedMemberEdit: 0,
    hosts: 0,
  };

  let afterId: string | null = null;
  for (;;) {
    const rows = await deps.items.linkImageBackfillCandidates(
      afterId,
      batch,
      LINK_IMAGE_RULES_VERSION,
    );
    for (const row of rows) {
      summary.scanned += 1;
      if (row.memberEdited) {
        summary.skippedMemberEdit += 1;
        continue;
      }
      const host = previewHost(row.url) ?? '';
      const position = perHost.get(host) ?? 0;
      perHost.set(host, position + 1);
      const startAfter = position * spacing;
      if (opts.dryRun) {
        deps.print?.(`${row.id} ${host || '-'} +${startAfter}s`);
        continue;
      }
      if (await enqueue(deps.sender, row.id, startAfter)) summary.enqueued += 1;
    }
    if (rows.length < batch) break;
    afterId = rows[rows.length - 1]!.id;
    await deps.pause?.();
  }

  summary.hosts = perHost.size;
  deps.log.info(
    { event: BACKFILL_EVENT, outcome: 'done', dryRun: Boolean(opts.dryRun), ...summary },
    'link image backfill done',
  );
  return summary;
}

/** True when a job was created; pg-boss answers null for a card that already has one queued. */
async function enqueue(sender: JobSender, itemId: string, startAfter: number): Promise<boolean> {
  const data: LinkSnapshotJob = { itemId };
  const id = await sender.send(QUEUES.linkSnapshot, data, {
    singletonKey: itemId,
    ...LINK_SNAPSHOT_SEND_OPTIONS,
    ...(startAfter > 0 ? { startAfter } : {}),
  });
  return id !== null;
}
