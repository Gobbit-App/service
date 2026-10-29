import { EMBED_SWEEP_BATCH } from '@gobbit/shared';
import type { EmbeddingsRepo } from '../repositories/embeddings.repo';
import { EMBED_ITEM_SEND_OPTIONS, QUEUES, type EmbedItemJob, type JobSender } from './queues';

/** D72: safety net for missed enqueues and model changes; returns how many it queued. */
export function createEmbedSweep(deps: {
  sender: JobSender;
  embeddings: Pick<EmbeddingsRepo, 'findStaleIds'>;
  model: string;
  batch?: number;
}) {
  const { sender, embeddings, model, batch = EMBED_SWEEP_BATCH } = deps;

  return async function sweep(): Promise<number> {
    const ids = await embeddings.findStaleIds(model, batch);
    for (const itemId of ids) {
      const data: EmbedItemJob = { itemId };
      await sender.send(QUEUES.embedItem, data, {
        singletonKey: itemId,
        ...EMBED_ITEM_SEND_OPTIONS,
      });
    }
    return ids.length;
  };
}
