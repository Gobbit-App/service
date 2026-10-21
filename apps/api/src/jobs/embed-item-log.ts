import { childLogger, type Logger } from '../lib/logger';
import type { EmbedItemOutcome } from './embed-item';

type EmbedItem = (
  itemId: string,
  job?: { id?: string; signal?: AbortSignal },
) => Promise<EmbedItemOutcome>;

/**
 * Wraps the embed-item handler with one JSON line per job (outcome + duration), and an error line
 * for failures before they propagate to pg-boss for retry — otherwise retries are silent.
 */
export function withEmbedItemLog(
  embedItem: EmbedItem,
  deps: { log?: Logger; now?: () => number } = {},
): EmbedItem {
  const { log = childLogger('worker'), now = () => performance.now() } = deps;

  return async (itemId, job) => {
    const start = now();
    const fields = () => ({
      itemId,
      jobId: job?.id ?? null,
      durationMs: Math.round(now() - start),
    });
    try {
      const outcome = await embedItem(itemId, job);
      log.info({ ...fields(), outcome }, 'embed item');
      return outcome;
    } catch (err) {
      log.error({ ...fields(), err }, 'embed item failed, pg-boss will retry');
      throw err;
    }
  };
}
