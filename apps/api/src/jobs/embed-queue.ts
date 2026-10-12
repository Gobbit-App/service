import type { EmbeddingsRepo } from '../repositories/embeddings.repo';
import { EMBED_ITEM_SEND_OPTIONS, QUEUES, type EmbedItemJob, type JobSender } from './queues';

/** Called by the items service after a write commits (D72). Never throws. */
export interface EmbedQueue {
  enqueueIfStale(itemId: string): Promise<void>;
}

/** Without `OPENAI_API_KEY` nothing is embedded, so nothing is enqueued (D73). */
export const noopEmbedQueue: EmbedQueue = {
  async enqueueIfStale() {},
};

export function createEmbedQueue(deps: {
  sender: JobSender;
  embeddings: Pick<EmbeddingsRepo, 'isStale'>;
  model: string;
  log?: (message: string) => void;
}): EmbedQueue {
  const { sender, embeddings, model, log = (m) => console.error(m) } = deps;

  return {
    async enqueueIfStale(itemId) {
      try {
        if (!(await embeddings.isStale(itemId, model))) return;
        const data: EmbedItemJob = { itemId };
        await sender.send(QUEUES.embedItem, data, {
          singletonKey: itemId,
          ...EMBED_ITEM_SEND_OPTIONS,
        });
      } catch (err) {
        // The sweeper picks the item up within a minute; a write must not fail on the queue.
        log(
          `[embed-queue] enqueue failed for ${itemId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    },
  };
}
