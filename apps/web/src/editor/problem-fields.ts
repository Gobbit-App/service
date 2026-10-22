import { isApiError } from '../api/api-error';
import { problemMessages } from '../api/problem-messages';
import { CATEGORY_REQUIRED, type FieldErrors } from './validate';

/** Where a failed save's messages go: next to fields, or once above the Save button. */
export type SaveErrors = { fields: FieldErrors; form: string | null };

export const OFFLINE_SAVE = "You're offline — your draft is saved on this device.";
export const FORBIDDEN_SAVE = "You can't edit this card.";
export const NOT_FOUND_SAVE = 'This card is no longer available.';
/** D160: the API no longer knows the photo (swept after a long-kept draft). */
export const PHOTO_EXPIRED = 'Photo expired, add it again';
const UNKNOWN_IMAGE = 'Unknown image';

/** Top-level keys of the item create/patch bodies; any other path is relative to `payload`. */
const TOP_LEVEL = new Set(['title', 'body', 'payload', 'categoryIds', 'sourceUrl', 'entities']);

type ProblemFieldError = { path?: unknown; message?: unknown };

/**
 * PATCH validates the payload on its own (`payloadSchemaFor(type).parse`), so its paths come
 * without the `payload.` prefix (`columns.1`); create paths are already full (`payload.columns.1`).
 */
export function fieldPath(path: string): string | null {
  if (path === '') return null;
  const head = path.split('.')[0]!;
  return TOP_LEVEL.has(head) ? path : `payload.${path}`;
}

function mapFieldErrors(errors: unknown): { fields: FieldErrors; unmapped: string[] } {
  const fields: FieldErrors = {};
  const unmapped: string[] = [];
  if (!Array.isArray(errors)) return { fields, unmapped };
  for (const entry of errors as ProblemFieldError[]) {
    const message = typeof entry?.message === 'string' ? entry.message : null;
    if (!message) continue;
    const path = typeof entry.path === 'string' ? fieldPath(entry.path) : null;
    if (path && !fields[path]) fields[path] = message;
    else if (!path) unmapped.push(message);
  }
  return { fields, unmapped };
}

/** Maps a failed create/update to field and form errors (contracts/api-reuse.md). */
export function problemToErrors(err: unknown): SaveErrors {
  if (!isApiError(err)) return { fields: {}, form: OFFLINE_SAVE };
  const type = err.problem?.type;

  if (type === '/problems/item-needs-category') {
    return { fields: { categoryIds: CATEGORY_REQUIRED }, form: null };
  }
  if (type === '/problems/validation' || type === '/problems/bad-request') {
    const { fields, unmapped } = mapFieldErrors(err.problem?.errors);
    if (fields['payload.publicId'] === UNKNOWN_IMAGE) fields['payload.publicId'] = PHOTO_EXPIRED;
    if (Object.keys(fields).length > 0) {
      return { fields, form: unmapped.length > 0 ? unmapped.join(' ') : null };
    }
  }
  if (err.status === 403) return { fields: {}, form: FORBIDDEN_SAVE };
  if (err.status === 404) return { fields: {}, form: NOT_FOUND_SAVE };
  // constraint-violation, payload-too-large, conflict and anything else: one form-level line.
  return { fields: {}, form: problemMessages(err).join(' ') };
}
