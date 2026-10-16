import type { NormalizedSource } from '@pb/shared';

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

/** The provider answered without a usable `propose_card` call. */
export class ExtractResponseError extends Error {}
