import type { IngestUnusedReason, MediaTitleSource } from '@gobbit/shared';

/** 045 (plan Accountability table): decisions ingestion makes about shared files. */
export type IngestMediaDecisions = {
  /** FR-027: a shared file was used, or not used (and why). */
  'ingest.media_file': { outcome: 'used' | 'unused'; reason?: IngestUnusedReason };
  /** D395: a PDF, audio or video share became a proposal; where its title came from. */
  'ingest.media_proposal': {
    outcome: 'proposed';
    reason?: 'kept' | 'dropped_too_long' | 'none';
  };
};

export type { MediaTitleSource };
