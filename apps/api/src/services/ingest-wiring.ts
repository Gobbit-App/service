import type { Db } from '@pb/db';
import { INGEST_COMBINED_DAILY_CAP, ingestDailyCaps } from '@pb/shared';
import type { Embedder } from '../ai/embedder';
import { runDedup } from '../ingest/run-dedup';
import { createDedupRepo } from '../repositories/dedup.repo';
import { createEmbeddingsRepo } from '../repositories/embeddings.repo';
import { createLlmCallsRepo } from '../repositories/llm-calls.repo';
import type { Env } from '../env';
import type { MembershipLookup } from '../access/authorize';
import { hasExtractProvider } from '../ai/providers';
import { noopIngestQueue, type IngestQueue } from '../jobs/ingest-queue';
import { createCloudinaryIngestUploads, type IngestUploadStore } from '../media/ingest-uploads';
import type { DecksRepo } from '../repositories/decks.repo';
import { createIngestJobsRepo } from '../repositories/ingest-jobs.repo';
import { createIngestTokensRepo } from '../repositories/ingest-tokens.repo';
import type { ResendInbound } from '../ingest/resend-inbound';
import { createIngestService } from './ingest.service';
import { createIngestTokensService } from './ingest-tokens.service';
import { createReviewService } from './review.service';
import { createSharesService } from './shares.service';
import { createCapGuard } from '../ingest/caps';
import type { ItemDtoMapper } from './item-dtos';
import type { EmbedQueue } from '../jobs/embed-queue';
import type { LinkSnapshotQueue } from '../jobs/link-snapshot-queue';
import { createCategoriesRepo } from '../repositories/categories.repo';
import { createItemsRepo, type ItemsRepo } from '../repositories/items.repo';
import type { UsersRepo } from '../repositories/users.repo';
import type { AssetsRepo } from '../repositories/assets.repo';
import type { ImageReferenceCheck } from './image-reference';

/** Overrides for tests; production builds everything from env (D93). */
export interface IngestWiring {
  /** Defaults to "an extraction provider key is set". */
  enabled?: boolean;
  /** `null` → image shares are refused (503); defaults to Cloudinary when configured. */
  uploads?: IngestUploadStore | null;
  queue?: IngestQueue;
  /** D104: Resend inbound reader for the email-in webhook; defaults to the Resend API. */
  emailInbound?: ResendInbound;
}

export function buildIngestServices(deps: {
  db: Db;
  env: Pick<
    Env,
    | 'OPENROUTER_API_KEY'
    | 'OPENAI_API_KEY'
    | 'ANTHROPIC_API_KEY'
    | 'CLOUDINARY_URL'
    | 'INGEST_DAILY_CAP'
  >;
  decks: DecksRepo;
  memberships: MembershipLookup;
  items: ItemsRepo;
  users: Pick<UsersRepo, 'findById'>;
  toDtos: ItemDtoMapper;
  embedQueue: EmbedQueue;
  linkSnapshotQueue: LinkSnapshotQueue;
  /** Embeds direct proposals for dedup (D103); null → the keyless signals only. */
  embedder: Embedder | null;
  assets: Pick<AssetsRepo, 'upsert'>;
  imageReference: ImageReferenceCheck;
  now: () => Date;
  /** D180: published proposals change public pages. */
  purgeDeck?: (deckId: string) => void;
  wiring?: IngestWiring;
}) {
  const { db, env, decks, memberships, now, wiring = {} } = deps;
  const jobs = createIngestJobsRepo(db);
  const uploads =
    wiring.uploads !== undefined
      ? wiring.uploads
      : env.CLOUDINARY_URL
        ? createCloudinaryIngestUploads(env.CLOUDINARY_URL)
        : null;

  const queue = wiring.queue ?? noopIngestQueue;
  const dailyCaps = ingestDailyCaps(env.INGEST_DAILY_CAP);

  return {
    ingest: createIngestService({
      enabled: wiring.enabled ?? hasExtractProvider(env),
      decks,
      memberships,
      jobs,
      categories: createCategoriesRepo(db),
      items: deps.items,
      uploads,
      assets: deps.assets,
      queue,
      dailyCaps,
      combinedCap: INGEST_COMBINED_DAILY_CAP,
      dedup: (input) =>
        runDedup(
          {
            dedup: createDedupRepo(db),
            embedder: deps.embedder,
            embeddings: createEmbeddingsRepo(db),
            llmCalls: createLlmCallsRepo(db),
          },
          input,
        ),
      embedQueue: deps.embedQueue,
      linkSnapshotQueue: deps.linkSnapshotQueue,
      now,
    }),
    ingestTokens: createIngestTokensService({
      tokens: createIngestTokensRepo(db),
      decks,
      memberships,
      now,
    }),
    shares: createSharesService({
      decks,
      memberships,
      jobs,
      items: deps.items,
      users: deps.users,
      queue,
      assertWithinCaps: createCapGuard({
        jobs,
        dailyCaps,
        combinedCap: INGEST_COMBINED_DAILY_CAP,
        now,
      }),
      now,
    }),
    review: createReviewService({
      decks,
      memberships,
      users: deps.users,
      items: deps.items,
      jobs,
      toDtos: deps.toDtos,
      // Publish/discard change the item, its categories and the job in one commit (D95 trigger).
      transaction: (fn) =>
        db.transaction((tx) =>
          fn({
            items: createItemsRepo(tx),
            categories: createCategoriesRepo(tx),
            jobs: createIngestJobsRepo(tx),
          }),
        ),
      uploads,
      embedQueue: deps.embedQueue,
      linkSnapshotQueue: deps.linkSnapshotQueue,
      imageReference: deps.imageReference,
      now,
      purgeDeck: deps.purgeDeck,
    }),
  };
}
