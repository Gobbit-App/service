import type { Db } from '@pb/db';
import type { Env } from '../env';
import type { MembershipLookup } from '../access/authorize';
import { hasExtractProvider } from '../ai/providers';
import { noopIngestQueue, type IngestQueue } from '../jobs/ingest-queue';
import { createCloudinaryIngestUploads, type IngestUploadStore } from '../media/ingest-uploads';
import type { DecksRepo } from '../repositories/decks.repo';
import { createIngestJobsRepo } from '../repositories/ingest-jobs.repo';
import { createIngestTokensRepo } from '../repositories/ingest-tokens.repo';
import { createIngestService } from './ingest.service';
import { createIngestTokensService } from './ingest-tokens.service';

/** Overrides for tests; production builds everything from env (D93). */
export interface IngestWiring {
  /** Defaults to "an extraction provider key is set". */
  enabled?: boolean;
  /** `null` → image shares are refused (503); defaults to Cloudinary when configured. */
  uploads?: IngestUploadStore | null;
  queue?: IngestQueue;
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
  now: () => Date;
  wiring?: IngestWiring;
}) {
  const { db, env, decks, memberships, now, wiring = {} } = deps;
  const uploads =
    wiring.uploads !== undefined
      ? wiring.uploads
      : env.CLOUDINARY_URL
        ? createCloudinaryIngestUploads(env.CLOUDINARY_URL)
        : null;

  return {
    ingest: createIngestService({
      enabled: wiring.enabled ?? hasExtractProvider(env),
      decks,
      memberships,
      jobs: createIngestJobsRepo(db),
      uploads,
      queue: wiring.queue ?? noopIngestQueue,
      dailyCap: env.INGEST_DAILY_CAP,
      now,
    }),
    ingestTokens: createIngestTokensService({
      tokens: createIngestTokensRepo(db),
      decks,
      memberships,
      now,
    }),
  };
}
