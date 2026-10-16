import type { ExtractionSummary, ItemCreate, NormalizedSource } from '@pb/shared';
import {
  correctionMessage,
  shouldEscalate,
  validateProposal,
  type ValidateContext,
  type ValidatedProposal,
} from '../ai/extract-validate';
import {
  ExtractResponseError,
  type ExtractCategory,
  type ExtractExample,
  type Extractor,
} from '../ai/extractor';
import { recordLlmCall, type LlmCallSink } from '../ai/llm-calls';

export interface RunExtractionDeps {
  extractor: Extractor;
  model: string;
  escalationModel: string;
  llmCalls: LlmCallSink;
}

export interface RunExtractionInput {
  source: NormalizedSource;
  categories: ExtractCategory[];
  examples: ExtractExample[];
  validate: ValidateContext;
  /** Attribution for `llm_calls` (D110). */
  jobId: string;
  deckId: string;
  userId: string | null;
  signal?: AbortSignal;
}

export type ExtractionOutcome =
  { ok: true; item: ItemCreate; summary: ExtractionSummary } | { ok: false; error: string };

type Accepted = Extract<ValidatedProposal, { ok: true }>;

/**
 * D105/D110: one primary call, validated; an invalid proposal gets exactly one corrective retry
 * (still invalid → failed). A valid but low-confidence proposal is escalated once to the stronger
 * model; an invalid escalation keeps the primary proposal. Provider/network errors propagate so
 * pg-boss retries the job.
 */
export async function runExtraction(
  deps: RunExtractionDeps,
  input: RunExtractionInput,
): Promise<ExtractionOutcome> {
  const { extractor, llmCalls } = deps;

  async function attempt(
    model: string,
    purpose: 'extract' | 'extract_escalated',
    correction?: string,
  ): Promise<ValidatedProposal> {
    let raw: unknown;
    try {
      const call = await recordLlmCall(
        llmCalls,
        {
          purpose,
          provider: extractor.provider,
          model,
          deckId: input.deckId,
          userId: input.userId,
          jobId: input.jobId,
        },
        () =>
          extractor.extract(
            {
              source: input.source,
              categories: input.categories,
              examples: input.examples,
              ...(correction ? { correction } : {}),
            },
            { model, signal: input.signal },
          ),
      );
      raw = call.raw;
    } catch (err) {
      // A response without the tool call is a bad output, not an outage: treat as invalid.
      if (err instanceof ExtractResponseError) return { ok: false, error: err.message };
      throw err;
    }
    return validateProposal(raw, input.validate);
  }

  const toOutcome = (p: Accepted, model: string, escalated: boolean): ExtractionOutcome => ({
    ok: true,
    item: p.item,
    summary: { model, escalated, ...p.summary },
  });

  let primary = await attempt(deps.model, 'extract');
  if (!primary.ok) {
    primary = await attempt(deps.model, 'extract', correctionMessage(primary.error));
    if (!primary.ok) return { ok: false, error: `invalid_output: ${primary.error}` };
  }

  if (shouldEscalate(primary.summary.confidence) && deps.escalationModel !== deps.model) {
    const escalated = await attempt(deps.escalationModel, 'extract_escalated');
    if (escalated.ok) return toOutcome(escalated, deps.escalationModel, true);
  }
  return toOutcome(primary, deps.model, false);
}
