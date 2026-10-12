/**
 * Phase 4 search constants (D71, D74–D77). One place for the eval set to tune;
 * the SQL in search.repo and the services read these, never literals.
 */

/** OpenAI text-embedding-3-small; a change is a migration (column + HNSW index). */
export const EMBEDDING_DIMS = 1536;
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_ASK_MODEL = 'claude-haiku-5-5';

/** Reciprocal Rank Fusion constant: score = Σ 1 / (RRF_K + rank). */
export const RRF_K = 60;
/** Extra score for a substring (ILIKE) hit, so exact strings like phone fragments win. */
export const SUBSTRING_BOOST = 1 / RRF_K;
/** Candidates per arm before fusion. */
export const SEARCH_ARM_TOP_N = 50;
/** `q <% search_text` threshold (pg_trgm.word_similarity_threshold). */
export const WORD_SIMILARITY_THRESHOLD = 0.4;
/** Vector arm keeps rows with cosine distance at or below this. */
export const VECTOR_MAX_DISTANCE = 0.55;
/** The text arm is skipped when the normalized query is shorter than this. */
export const TEXT_ARM_MIN_CHARS = 3;
/** pgvector HNSW ef_search applied per query (D74). */
export const HNSW_EF_SEARCH = 100;

export const SEARCH_Q_MAX = 200;
export const SEARCH_LIMIT_MAX = 20;
export const SEARCH_LIMIT_DEFAULT = 20;

/** Query-embedding cache (D76). */
export const QUERY_EMBEDDING_CACHE_MAX = 500;
export const QUERY_EMBEDDING_CACHE_TTL_MS = 60 * 60 * 1000;
/** Per-user query embeddings per hour; over budget the search runs text-only. */
export const QUERY_EMBEDDING_BUDGET_PER_HOUR = 300;

/** Ask (D77). */
export const ASK_TOP_K = 8;
export const ASK_QUESTION_MIN = 3;
export const ASK_QUESTION_MAX = 300;
export const ASK_RATE_LIMIT_PER_HOUR = 30;
export const ASK_TIMEOUT_MS = 20_000;

/** Embedding jobs (D72, D73). */
export const EMBED_BATCH_MAX = 100;
export const EMBED_TIMEOUT_MS = 10_000;
export const EMBED_SWEEP_BATCH = 50;
export const EMBED_SWEEP_CRON = '* * * * *';

/** Query log retention (D80). */
export const SEARCH_QUERY_RETENTION_DAYS = 180;
export const SEARCH_QUERY_PRUNE_CRON = '0 3 * * 0';

export const searchWhys = ['text', 'semantic', 'both'] as const;
export type SearchWhy = (typeof searchWhys)[number];

export const searchModes = ['search', 'ask'] as const;
export type SearchMode = (typeof searchModes)[number];

export const llmPurposes = ['embed_item', 'embed_query', 'ask'] as const;
export type LlmPurpose = (typeof llmPurposes)[number];

export const llmCallStatuses = ['ok', 'error'] as const;
export type LlmCallStatus = (typeof llmCallStatuses)[number];
