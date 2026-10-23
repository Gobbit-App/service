import type { ItemRow } from '@pb/db';
import type {
  DedupVerdict,
  ExtractionSummary,
  IngestChannel,
  ItemCreate,
  SourceKind,
} from '@pb/shared';
import type { EmbedQueue } from '../jobs/embed-queue';
import type { LinkSnapshotQueue } from '../jobs/link-snapshot-queue';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import { explicitVerdict } from './dedup-verdict';
import type { RunDedupInput } from './run-dedup';

export interface ProposeDeps {
  categories: Pick<CategoriesRepo, 'findDefault'>;
  items: Pick<ItemsRepo, 'create'>;
  jobs: Pick<IngestJobsRepo, 'update'>;
  /** D103: the dedup verdict for the new proposal (bound `runDedup`); omitted → no verdict. */
  dedup?: (input: RunDedupInput) => Promise<DedupVerdict>;
  embedQueue: EmbedQueue;
  /** D163: copy a proposed link's preview image; omitted → no snapshot. */
  linkSnapshotQueue?: LinkSnapshotQueue;
  now: () => Date;
  log: (message: string) => void;
}

export interface ProposeInput {
  job: { id: string; deckId: string; userId: string; channel: IngestChannel };
  /** A validated draft (card limits already checked). */
  item: ItemCreate;
  /** What decided the draft; its `categoryIds` are the draft's categories in the deck. */
  summary: ExtractionSummary;
  /** A direct proposal that names the card it updates: no similarity search (`explicit`). */
  targetItemId?: string | null;
  signal?: AbortSignal;
}

/** D100: email shares are `email`, AI apps `mcp`; everything else came through a share. */
export function sourceKindFor(channel: IngestChannel): SourceKind {
  if (channel === 'email') return 'email';
  if (channel === 'mcp') return 'mcp';
  return 'share';
}

export interface ProposeResult {
  item: ItemRow;
  dedup: DedupVerdict | null;
}

/**
 * The steps after extraction, shared by the worker and direct proposals: default-category
 * fallback, the `proposed` item by the sharer (D109), the dedup verdict (D103), the job update
 * and the embedding. A dedup error leaves no verdict, since the proposal already exists.
 */
export async function proposeItem(deps: ProposeDeps, input: ProposeInput): Promise<ProposeResult> {
  const { job, item, summary } = input;

  // A proposal needs a visible home; the default category stands in when none fit.
  let categoryIds = summary.categoryIds;
  if (categoryIds.length === 0) {
    const fallback = await deps.categories.findDefault(job.deckId);
    categoryIds = fallback ? [fallback.id] : [];
  }

  const created = await deps.items.create(
    {
      deckId: job.deckId,
      type: item.type,
      status: 'proposed',
      title: item.title,
      body: item.body,
      payload: item.payload,
      entities: item.entities ?? {},
      sourceUrl: item.sourceUrl ?? null,
      sourceKind: sourceKindFor(job.channel),
      verifiedAt: null,
      createdBy: job.userId,
    },
    categoryIds,
  );

  const dedup = input.targetItemId
    ? explicitVerdict(input.targetItemId)
    : await verdictFor(deps, {
        itemId: created.id,
        deckId: job.deckId,
        title: created.title,
        sourceUrl: created.sourceUrl,
        jobId: job.id,
        userId: job.userId,
        signal: input.signal,
      });

  await deps.jobs.update(job.id, {
    status: 'proposed',
    extraction: { ...summary, categoryIds },
    resultItemId: created.id,
    dedup,
    error: null,
    finishedAt: deps.now(),
  });
  await deps.embedQueue.enqueueIfStale(created.id);
  await deps.linkSnapshotQueue?.enqueueIfNeeded(created);
  return { item: created, dedup };
}

async function verdictFor(deps: ProposeDeps, input: RunDedupInput): Promise<DedupVerdict | null> {
  if (!deps.dedup) return null;
  try {
    return await deps.dedup(input);
  } catch (err) {
    deps.log(
      `[ingest] dedup for job ${input.jobId} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
