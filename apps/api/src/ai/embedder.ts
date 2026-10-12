/** D73: one embedding provider behind an interface, so the vendor can change without callers noticing. */
export interface EmbedResult {
  /** One vector per input text, in input order. */
  vectors: number[][];
  inputTokens: number;
}

export interface Embedder {
  /** Provider name recorded in `llm_calls.provider` (e.g. `openai`, `fake`). */
  readonly provider: string;
  readonly model: string;
  readonly dims: number;
  embed(texts: string[], opts?: { signal?: AbortSignal }): Promise<EmbedResult>;
}
