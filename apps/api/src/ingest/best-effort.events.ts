import type { IngestChannel } from '@gobbit/shared';
import { decisionLogger, type DecisionLevel } from '../lib/decision-event';
import type { Logger } from '../lib/logger';

/** 050 (contracts/best-effort.md): smart share is off, so ingestion saved the share as sent (or could not). */
export type IngestBestEffortDecisions = {
  'ingest.extraction_skipped': { outcome: 'proposed' | 'failed'; reason: 'smart_share_off' };
};

export const BEST_EFFORT_DECISION_LEVELS: Partial<Record<string, DecisionLevel>> = {
  'ingest.extraction_skipped:failed': 'warn',
};

/** Ids and counts only: never titles, text, addresses or file names. */
export type ExtractionSkippedFields = {
  outcome: 'proposed' | 'failed';
  /** The pg-boss job id, the correlation id. */
  jobId: string;
  deckId: string;
  userId: string;
  channel: IngestChannel;
  kind: 'link' | 'media' | 'text' | null;
  /** The proposal, when `proposed`. */
  itemId?: string;
  /** The body was cut at the limit. */
  cut: boolean;
  /** Photos not used because a web address won (0 otherwise). */
  unusedPhotos: number;
};

export function logExtractionSkipped(
  log: Logger | undefined,
  fields: ExtractionSkippedFields,
): void {
  decisionLogger<IngestBestEffortDecisions>('ingest', {
    levels: BEST_EFFORT_DECISION_LEVELS,
    parent: log,
  }).record('ingest.extraction_skipped', { ...fields, reason: 'smart_share_off' });
}
