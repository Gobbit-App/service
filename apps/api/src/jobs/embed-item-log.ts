import type { EmbedItemOutcome } from './embed-item';

type EmbedItem = (
  itemId: string,
  job?: { id?: string; signal?: AbortSignal },
) => Promise<EmbedItemOutcome>;

/**
 * Wraps the embed-item handler with one line per job (outcome + duration), and a line for
 * failures before they propagate to pg-boss for retry — otherwise retries are silent.
 */
export function withEmbedItemLog(
  embedItem: EmbedItem,
  deps: {
    log?: (line: string) => void;
    logError?: (line: string) => void;
    now?: () => number;
  } = {},
): EmbedItem {
  const {
    log = (line) => console.log(line),
    logError = (line) => console.error(line),
    now = () => performance.now(),
  } = deps;

  return async (itemId, job) => {
    const start = now();
    const elapsed = () => `${Math.round(now() - start)}ms`;
    try {
      const outcome = await embedItem(itemId, job);
      log(`[worker] embed ${itemId} → ${outcome} (${elapsed()})`);
      return outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError(
        `[worker] embed ${itemId} failed after ${elapsed()}, pg-boss will retry: ${message}`,
      );
      throw err;
    }
  };
}
