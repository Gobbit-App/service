import type { IngestFailureCode } from '@pb/shared';

/** Where in the pipeline a thrown error came from. */
export type IngestStage = 'normalize' | 'extract';

/** Error codes `fail()` stores for jobs that never reached extraction. */
const FIXED_CODES: Record<string, IngestFailureCode> = {
  raw_missing: 'content_expired',
  sharer_gone: 'sharer_left',
  sharer_not_member: 'sharer_left',
};

/** A provider that couldn't read the uploaded photo says so in its message. */
const IMAGE_ERROR = /\bimages?\b/i;

const INVALID_OUTPUT_PREFIX = 'invalid_output: ';
const DETAIL_MAX = 300;

/**
 * What a model answer got wrong, safe to log: `invalid_output` errors are zod issues
 * (`path: message`, no values) or fixed extractor messages, never shared content. Other errors
 * may quote the shared URL or text, so they have no detail.
 */
export function failureDetail(error: string): string | undefined {
  if (!error.startsWith(INVALID_OUTPUT_PREFIX)) return undefined;
  return error.slice(INVALID_OUTPUT_PREFIX.length, INVALID_OUTPUT_PREFIX.length + DETAIL_MAX);
}

/**
 * D194: maps what went wrong to the reason the sharer sees. `input` is the stored error code
 * (`raw_missing`, `invalid_output: …`) or the error the pipeline threw at `stage`.
 */
export function classifyFailure(input: unknown, stage?: IngestStage): IngestFailureCode {
  if (typeof input === 'string') {
    const fixed = FIXED_CODES[input];
    if (fixed) return fixed;
    if (input.startsWith('invalid_output')) return 'unreadable_answer';
    return 'unknown';
  }
  const message = input instanceof Error ? input.message : String(input);
  if (IMAGE_ERROR.test(message)) return 'image_unavailable';
  if (stage === 'normalize') return 'fetch_failed';
  if (stage === 'extract') return 'assistant_unavailable';
  return 'unknown';
}
