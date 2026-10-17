import type { NewLlmCallRow } from '@pb/db';
import type { LlmPurpose } from '@pb/shared';

/**
 * USD per 1M tokens, keyed by the id the provider is called with (OpenRouter ids carry a
 * `vendor/` prefix). Unknown models cost 0 (still logged), so add a row when switching ASK_MODEL.
 * Prices as of 2026-10.
 */
export const LLM_PRICES_PER_MTOK: Readonly<Record<string, { input: number; output: number }>> = {
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'anthropic/claude-haiku-5.5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 3, output: 15 },
  'anthropic/claude-sonnet-5.5': { input: 3, output: 15 },
  'qwen/qwen3.7-flash': { input: 0.03, output: 0.13 },
  'openai/gpt-5-nano': { input: 0.05, output: 0.4 },
};

const ERROR_MESSAGE_MAX = 500;

/** Cost in USD for one call; unknown models cost 0. */
export function llmCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = LLM_PRICES_PER_MTOK[model];
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** Formats a USD cost as a 6-decimal string (matches numeric(10,6)). */
export function formatCostUsd(cost: number): string {
  return cost.toFixed(6);
}

export interface LlmCallSink {
  insert(row: NewLlmCallRow): Promise<void>;
}

export interface LlmCallContext {
  purpose: LlmPurpose;
  provider: string;
  model: string;
  deckId?: string | null;
  itemId?: string | null;
  userId?: string | null;
  jobId?: string | null;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens?: number;
}

async function insertRow(
  sink: LlmCallSink,
  row: NewLlmCallRow,
  log: (message: string) => void,
): Promise<void> {
  try {
    await sink.insert(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`llm_calls insert failed: ${message}`);
  }
}

/**
 * Runs `fn`, measures latency with `now()` (default Date.now), then inserts ONE row:
 * success → status 'ok', tokens from the result, costUsd = formatCostUsd(llmCostUsd(...)), error null.
 * failure → status 'error', tokens 0, cost '0.000000', error = message truncated to 500 chars; then rethrows the ORIGINAL error.
 * A failing sink.insert is caught and reported via `log` (default console.error) and never masks the result or the original error.
 */
export async function recordLlmCall<T extends LlmUsage>(
  sink: LlmCallSink,
  ctx: LlmCallContext,
  fn: () => Promise<T>,
  opts?: { now?: () => number; log?: (message: string) => void },
): Promise<T> {
  const now = opts?.now ?? Date.now;
  const log = opts?.log ?? ((message: string) => console.error(message));
  const started = now();

  let result: T;
  try {
    result = await fn();
  } catch (err) {
    const latencyMs = now() - started;
    const message = err instanceof Error ? err.message : String(err);
    await insertRow(
      sink,
      {
        ...ctx,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: formatCostUsd(0),
        latencyMs,
        status: 'error',
        error: message.slice(0, ERROR_MESSAGE_MAX),
      },
      log,
    );
    throw err;
  }

  const latencyMs = now() - started;
  const inputTokens = result.inputTokens;
  const outputTokens = result.outputTokens ?? 0;
  await insertRow(
    sink,
    {
      ...ctx,
      inputTokens,
      outputTokens,
      costUsd: formatCostUsd(llmCostUsd(ctx.model, inputTokens, outputTokens)),
      latencyMs,
      status: 'ok',
      error: null,
    },
    log,
  );
  return result;
}
