import type { NormalizedSource } from '@gobbit/shared';

/** A deck category offered to the model (id + display name). */
export interface ExtractCategory {
  id: string;
  name: string;
}

/** A recent published card shown to the model as a style example (D105). */
export interface ExtractExample {
  type: string;
  title: string;
  body: string;
}

export interface ExtractInput {
  source: NormalizedSource;
  categories: ExtractCategory[];
  examples: ExtractExample[];
  /** Set on the corrective retry: why the previous output was rejected. */
  correction?: string;
}

/** One provider call: the unvalidated `propose_card` input plus usage. */
export interface ExtractCall {
  raw: unknown;
  inputTokens: number;
  outputTokens: number;
}

/** D105: turns a normalized source into a proposed card through a forced tool call. */
export interface Extractor {
  /** Provider name recorded in `llm_calls.provider` (e.g. `anthropic`, `openrouter`, `fake`). */
  readonly provider: string;
  extract(input: ExtractInput, opts: { model: string; signal?: AbortSignal }): Promise<ExtractCall>;
}

/**
 * Output budget for one `propose_card` call: a 2000-character body in a non-Latin script plus
 * entities can pass 1024 tokens, and a model that reasons spends its thinking from the same
 * budget, so a cut-off call is unreadable JSON (D354).
 */
export const EXTRACT_MAX_TOKENS = 8192;

/**
 * D354: why an answer had no usable `propose_card` call. `truncated` (the output budget ran out)
 * and `refused` come from the provider's stop reason; a repeat with the same budget won't help.
 */
export type ExtractResponseKind = 'truncated' | 'refused' | 'no_call' | 'bad_json';

export interface ExtractUsage {
  inputTokens: number;
  outputTokens: number;
}

/** The provider answered without a usable `propose_card` call. */
export class ExtractResponseError extends Error {
  readonly kind: ExtractResponseKind;
  /** The provider's raw stop reason (`finish_reason` / `stop_reason`), when it sent one. */
  readonly stopReason: string | null;
  /** Tokens the failed call still used, so `llm_calls` records them (D354). */
  readonly usage: ExtractUsage | null;

  constructor(
    kind: ExtractResponseKind,
    opts: { stopReason?: string | null; usage?: ExtractUsage | null } = {},
  ) {
    const stopReason = opts.stopReason ?? null;
    super(`${EXTRACT_RESPONSE_MESSAGES[kind]}${stopReason ? ` (stop: ${stopReason})` : ''}`);
    this.name = 'ExtractResponseError';
    this.kind = kind;
    this.stopReason = stopReason;
    this.usage = opts.usage ?? null;
  }

  /** Whether a corrective retry with the same budget could help. */
  get retryable(): boolean {
    return this.kind === 'no_call' || this.kind === 'bad_json';
  }
}

const EXTRACT_RESPONSE_MESSAGES: Record<ExtractResponseKind, string> = {
  truncated: 'propose_card call cut off by the output budget',
  refused: 'the model refused the propose_card call',
  no_call: 'Extraction returned no propose_card call',
  bad_json: 'propose_card arguments are not valid JSON',
};

/**
 * D354: the error for an answer without a usable call, judged by the stop reason first: a cut-off
 * or refusal explains a missing call or broken JSON better than the symptom does.
 */
export function responseError(
  symptom: 'no_call' | 'bad_json',
  stopReason: string | null | undefined,
  usage: ExtractUsage | null,
): ExtractResponseError {
  const reason = stopReason ?? null;
  const kind: ExtractResponseKind =
    reason === 'length' || reason === 'max_tokens'
      ? 'truncated'
      : reason === 'refusal' || reason === 'content_filter'
        ? 'refused'
        : symptom;
  return new ExtractResponseError(kind, { stopReason: reason, usage });
}
