import { IMPORT_ROWS_PER_REQUEST } from '../ingest/constants';
import type { ImportRowDraft } from './to-draft';

const RATE_LIMITED = '/problems/rate-limited';

/** One row the API could not propose; `index` is into the whole import, not the chunk. */
export interface ImportRunFailure {
  index: number;
  problem: string;
  detail?: string;
}

/** The shape of `importResultSchema`, zod-free for the lazy web chunk and the CLI. */
export interface ImportRunResult {
  imported: number;
  duplicates: number;
  failed: ImportRunFailure[];
}

/** Sends one chunk (≤ `IMPORT_ROWS_PER_REQUEST` rows) to `POST /decks/{id}/imports`. */
export type SendImportChunk = (rows: ImportRowDraft[]) => Promise<ImportRunResult>;

/** How a thrown chunk error is reported for its rows. */
export type DescribeImportError = (err: unknown) => Omit<ImportRunFailure, 'index'>;

const describeDefault: DescribeImportError = (err) => ({
  problem: '/problems/request-failed',
  detail: err instanceof Error ? err.message : String(err),
});

function failRest(
  failed: ImportRunFailure[],
  from: number,
  to: number,
  why: Omit<ImportRunFailure, 'index'>,
): void {
  for (let index = from; index < to; index += 1) failed.push({ index, ...why });
}

/**
 * D190: imports drafts in chunks, one request after another, adding up the results. After a
 * daily cap hit (or a failed request once something was imported) the remaining rows are
 * reported failed instead of sent. A failing first request is rethrown: nothing was imported.
 */
export async function importInChunks(
  drafts: readonly ImportRowDraft[],
  send: SendImportChunk,
  options: { chunkSize?: number; describeError?: DescribeImportError } = {},
): Promise<ImportRunResult> {
  const chunkSize = options.chunkSize ?? IMPORT_ROWS_PER_REQUEST;
  const describe = options.describeError ?? describeDefault;
  const total: ImportRunResult = { imported: 0, duplicates: 0, failed: [] };

  for (let offset = 0; offset < drafts.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, drafts.length);
    let result: ImportRunResult;
    try {
      result = await send(drafts.slice(offset, end));
    } catch (err) {
      if (offset === 0) throw err;
      failRest(total.failed, offset, drafts.length, describe(err));
      break;
    }
    total.imported += result.imported;
    total.duplicates += result.duplicates;
    total.failed.push(...result.failed.map((f) => ({ ...f, index: f.index + offset })));
    const capHit = result.failed.find((f) => f.problem === RATE_LIMITED);
    if (capHit && end < drafts.length) {
      failRest(total.failed, end, drafts.length, {
        problem: RATE_LIMITED,
        ...(capHit.detail ? { detail: capHit.detail } : {}),
      });
      break;
    }
  }
  return total;
}
