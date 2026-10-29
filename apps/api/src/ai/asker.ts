import type { TextScript } from '@gobbit/shared';

/** A retrieved card handed to the model as delimited data (D77). */
export interface AskCard {
  id: string;
  title: string;
  body: string;
  /** Payload string leaves (link url/preview, table cells, …) joined with spaces. */
  details: string;
}

export interface AskInput {
  question: string;
  cards: AskCard[];
  /** Language the answer must be written in (`dominantScript` of the question). */
  language: TextScript;
}

/** Structured output of one Ask call; `citedItemIds` is unfiltered model output. */
export interface AskOutput {
  answer: string;
  citedItemIds: string[];
  grounded: boolean;
  inputTokens: number;
  outputTokens: number;
}

export interface Asker {
  /** Provider name recorded in `llm_calls.provider` (e.g. `anthropic`, `fake`). */
  readonly provider: string;
  readonly model: string;
  ask(input: AskInput, opts?: { signal?: AbortSignal }): Promise<AskOutput>;
}
