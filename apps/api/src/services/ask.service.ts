import {
  ASK_RATE_LIMIT_PER_HOUR,
  ASK_TIMEOUT_MS,
  ASK_TOP_K,
  dominantScript,
  type AskResponse,
} from '@pb/shared';
import type { Asker } from '../ai/asker';
import { NOT_FOUND_ANSWER } from '../ai/ask-prompt';
import { resolveCitations } from '../ai/ask-citations';
import { recordLlmCall, type LlmCallSink } from '../ai/llm-calls';
import { payloadText } from '../ai/payload-text';
import { gatewayTimeout, serviceUnavailable } from '../errors/http-errors';
import { rateKeys } from '../lib/rate-window';
import type { CurrentUser } from '../types';
import type { RateLimitService } from './rate-limit.service';
import type { SearchService } from './search.service';
import { lineSink } from '../lib/logger';

export function createAskService(deps: {
  /** Null without an Ask key (`OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY`) → 503 (D73). */
  asker: Asker | null;
  search: Pick<SearchService, 'retrieve'>;
  rateLimits: Pick<RateLimitService, 'enforce'>;
  llmCalls: LlmCallSink;
  timeoutMs?: number;
  log?: (message: string) => void;
}) {
  const {
    asker,
    search,
    rateLimits,
    llmCalls,
    timeoutMs = ASK_TIMEOUT_MS,
    log = lineSink('ask'),
  } = deps;

  /** Calls the model under a deadline; maps abort → 504 and any provider failure → 503. */
  async function callAsker(
    model: Asker,
    input: Parameters<Asker['ask']>[0],
    ctx: { deckId: string; userId: string },
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await recordLlmCall(
        llmCalls,
        { purpose: 'ask', provider: model.provider, model: model.model, ...ctx },
        () => model.ask(input, { signal: controller.signal }),
      );
    } catch (err) {
      if (controller.signal.aborted) throw gatewayTimeout('The answer took too long');
      log(`[ask] provider failed: ${err instanceof Error ? err.message : String(err)}`);
      throw serviceUnavailable('Ask is temporarily unavailable');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** D77: retrieve top-K, answer only from those cards, keep only citations we retrieved. */
    async ask(user: CurrentUser, idOrSlug: string, question: string): Promise<AskResponse> {
      if (!asker) throw serviceUnavailable('Ask is not configured');
      await rateLimits.enforce(rateKeys.askUser(user.id), ASK_RATE_LIMIT_PER_HOUR);

      const retrieval = await search.retrieve(user, idOrSlug, question, ASK_TOP_K, 'ask');
      const language = dominantScript(question);
      const notFound: AskResponse = {
        answer: NOT_FOUND_ANSWER[language],
        citations: [],
        grounded: false,
      };
      if (retrieval.hits.length === 0) return notFound;

      const cards = retrieval.hits.map(({ row }) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        details: payloadText(row.type, row.payload),
      }));
      const output = await callAsker(
        asker,
        { question, cards, language },
        { deckId: retrieval.deckId, userId: user.id },
      );

      const citations = resolveCitations(output.citedItemIds, cards);
      if (!output.grounded || citations.length === 0) return notFound;
      return { answer: output.answer, citations, grounded: true };
    },
  };
}

export type AskService = ReturnType<typeof createAskService>;
