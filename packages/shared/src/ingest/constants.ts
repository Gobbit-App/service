/**
 * Phase 5 ingestion constants (D93–D110). One place to tune; the API, worker and web read
 * these, never literals.
 */

export const ingestJobStatuses = [
  'queued',
  'running',
  'proposed',
  'failed',
  'published',
  'discarded',
] as const;
export type IngestJobStatus = (typeof ingestJobStatuses)[number];

/** Statuses after which the worker never touches the job again. */
export const terminalIngestJobStatuses: readonly IngestJobStatus[] = [
  'proposed',
  'failed',
  'published',
  'discarded',
];

/**
 * `mcp`: proposals made directly by an AI app (Phase 13), never fetched or extracted.
 * `import`: bulk-imported notes (D190), also direct proposals.
 */
export const ingestChannels = ['pwa', 'shortcut', 'email', 'paste', 'mcp', 'import'] as const;
export type IngestChannel = (typeof ingestChannels)[number];

/** D100: the agent proposes only these card types. */
export const ingestCardTypes = ['text', 'link', 'image'] as const;
export type IngestCardType = (typeof ingestCardTypes)[number];

export const dedupActions = ['new', 'possible_duplicate', 'update'] as const;
export type DedupAction = (typeof dedupActions)[number];

/** `explicit`: a direct proposal named the card it updates, so no similarity search ran. */
export const dedupVias = ['source_url', 'vector', 'title', 'none', 'explicit'] as const;
export type DedupVia = (typeof dedupVias)[number];

/** D110: jobs per user and channel in a rolling day (default of INGEST_DAILY_CAP). */
export const INGEST_DAILY_CAP = 50;
/** Jobs per user across all channels in a rolling day, so per-channel caps can't be stacked. */
export const INGEST_COMBINED_DAILY_CAP = 200;
/** Longest app name kept on a direct proposal (`ingest_jobs.client_label`). */
export const INGEST_CLIENT_LABEL_MAX = 60;
/** `extraction.model` of a direct proposal: nothing was extracted. */
export const DIRECT_PROPOSAL_MODEL = 'direct';
export const INGEST_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** D101: uploads and request size. */
export const INGEST_MAX_IMAGES = 3;
export const INGEST_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const INGEST_BODY_MAX_BYTES = 25 * 1024 * 1024;
export const API_BODY_MAX_BYTES = 1024 * 1024;
export const INGEST_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;
export type IngestImageMime = (typeof INGEST_IMAGE_MIMES)[number];
/** Shared text and title accepted by POST /ingest. */
export const INGEST_TEXT_MAX = 10_000;
export const INGEST_TITLE_MAX = 300;
/** Width of the derived JPEG the model sees (D101). */
export const INGEST_IMAGE_LLM_WIDTH = 1568;

/** D102: SSRF-safe fetch. */
export const FETCH_TIMEOUT_MS = 10_000;
export const FETCH_MAX_BYTES = 3 * 1024 * 1024;
export const FETCH_MAX_REDIRECTS = 3;
export const PAGE_TEXT_MAX = 8000;

/** D105: extraction. */
export const DEFAULT_EXTRACT_MODEL = 'claude-haiku-5-5';
export const DEFAULT_EXTRACT_ESCALATION_MODEL = 'claude-sonnet-5-5';
export const EXTRACT_CONFIDENCE_MIN = 0.6;
export const EXTRACT_TITLE_TARGET = 60;
export const EXTRACT_TIMEOUT_MS = 30_000;
export const EXTRACT_MAX_CATEGORIES = 2;
export const EXTRACT_STYLE_EXAMPLES = 3;

/** D103: dedup thresholds (cosine similarity = 1 - cosine distance). */
export const DEDUP_UPDATE_SIMILARITY = 0.92;
export const DEDUP_POSSIBLE_SIMILARITY = 0.8;
/** Keyless fallback: word_similarity(title) at or above this → possible duplicate. */
export const DEDUP_TITLE_SIMILARITY = 0.8;

/** D93/D94: worker schedules and retention. */
export const INGEST_JOB_RETRIES = 2;
export const INGEST_SWEEP_STALE_MS = 5 * 60 * 1000;
export const INGEST_SWEEP_CRON = '*/5 * * * *';
export const INGEST_RAW_RETENTION_DAYS = 30;
export const INGEST_PRUNE_CRON = '0 4 * * 0';

/** D99: ingest tokens. */
export const INGEST_TOKEN_PREFIX = 'ing_';
export const INGEST_TOKENS_MAX = 5;
export const INGEST_TOKEN_LABEL_MAX = 60;
/** Characters of the token shown in settings (`ing_x7Q2…`). */
export const INGEST_TOKEN_DISPLAY_PREFIX = 8;

/** D106: review queue page size. */
export const REVIEW_LIMIT = 50;

/** D189–D191: bulk import of notes and bulk publish. */
export const IMPORT_ROWS_PER_REQUEST = 100;
/** Rows the import screen parses before asking to split the notes (= the daily cap). */
export const IMPORT_ROWS_PER_PREVIEW = 150;
/** Longest title taken from the start of a note line. */
export const IMPORT_TITLE_SPLIT_MAX = 80;
export const IMPORT_LABEL_MAX = INGEST_CLIENT_LABEL_MAX;
/** Ids per `POST /decks/{id}/review/publish`. */
export const BULK_PUBLISH_MAX = 50;

/**
 * D194: why a share failed, in words the sharer can act on (`ingest_jobs.failure_code`).
 * The raw `error` text stays server-side.
 */
export const ingestFailureCodes = [
  'content_expired',
  'sharer_left',
  'fetch_failed',
  'unreadable_answer',
  'assistant_unavailable',
  'image_unavailable',
  'unknown',
] as const;
export type IngestFailureCode = (typeof ingestFailureCodes)[number];

/** D193: what the auto-publish gate decided for a share (`ingest_jobs.auto_publish`). */
export const autoPublishOutcomes = [
  'published',
  'held_not_publisher',
  'held_needs_category',
  'held_duplicate',
  'held_duplicate_check_failed',
  'held_publish_failed',
] as const;
export type AutoPublishOutcome = (typeof autoPublishOutcomes)[number];

/** D196: channels a person shares through; listed in Your shares and auto-published (FR-015). */
export const shareChannels = [
  'pwa',
  'shortcut',
  'paste',
  'email',
] as const satisfies readonly IngestChannel[];
export type ShareChannel = (typeof shareChannels)[number];

/** D196–D198: Your shares. */
export const SHARES_LIST_LIMIT = 50;
export const SHARE_MAX_RETRIES = 3;
export const SHARE_POLL_MS = 3000;
/**
 * Failures a retry can fix. `sharer_left` needs the membership back first; `content_expired`
 * has no saved share left to run again.
 */
export const RETRYABLE_FAILURES: readonly IngestFailureCode[] = ingestFailureCodes.filter(
  (code) => code !== 'sharer_left' && code !== 'content_expired',
);
