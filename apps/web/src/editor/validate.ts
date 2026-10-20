import {
  CALC_MAX_FIELDS,
  CARD_BODY_MAX,
  CARD_TITLE_MAX,
  PAYLOAD_MAX_BYTES,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
  codePointLength,
  utf8Bytes,
} from '@pb/shared/card-limits';
import {
  parseCalcDefault,
  toPayload,
  type CalcDraftPayload,
  type Draft,
  type LinkDraftPayload,
} from './draft';
import type { TablePayload } from '../cards/payload-guards';

/** Errors keyed by dotted path, the same syntax as `problem.errors[].path` (e.g. `payload.rows.3.1`). */
export type FieldErrors = Partial<Record<string, string>>;

/** Checks a calc expression against the field keys; injected by the lazy `CalcFields` (mathjs). */
export type CalcExpressionCheck = (
  expression: string,
  keys: readonly string[],
) => { ok: true } | { ok: false; message: string };

export type ValidateOptions = {
  calcExpression?: CalcExpressionCheck;
  /** A proposal may have no category yet; publishing assigns one (D6 applies to published). */
  categoriesOptional?: boolean;
};

export const CATEGORY_REQUIRED = 'Pick at least one category';

const CALC_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
/** Function names the calc expression allows; a field key with one of these names is refused. */
const CALC_FUNCTIONS = new Set(['round', 'min', 'max', 'abs', 'floor', 'ceil']);

/** Mirrors `httpUrlSchema`: parses as a URL and starts with http:// or https://. */
export function isHttpUrl(value: string): boolean {
  if (!value.startsWith('http://') && !value.startsWith('https://')) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function checkCommon(draft: Draft, errors: FieldErrors, categoriesOptional: boolean): void {
  const title = draft.title.trim();
  if (title === '') errors['title'] = 'Title is required';
  else if (codePointLength(title) > CARD_TITLE_MAX) {
    errors['title'] = `Title must be at most ${CARD_TITLE_MAX} characters`;
  }
  if (codePointLength(draft.body) > CARD_BODY_MAX) {
    errors['body'] = `Body must be at most ${CARD_BODY_MAX} characters`;
  }
  if (!categoriesOptional && draft.categoryIds.length === 0) {
    errors['categoryIds'] = CATEGORY_REQUIRED;
  }
  const sourceUrl = draft.sourceUrl.trim();
  if (sourceUrl !== '' && !isHttpUrl(sourceUrl)) {
    errors['sourceUrl'] = 'Enter a full http:// or https:// address';
  }
}

function checkLink(payload: LinkDraftPayload, errors: FieldErrors): void {
  const url = payload.url.trim();
  if (url === '') errors['payload.url'] = 'URL is required';
  else if (!isHttpUrl(url)) errors['payload.url'] = 'Enter a full http:// or https:// address';
  const image = payload.preview?.image;
  if (image !== undefined && image !== '' && !isHttpUrl(image)) {
    errors['payload.preview.image'] = 'Preview image must be an http(s) address';
  }
}

function checkTable(payload: TablePayload, errors: FieldErrors): void {
  const { columns, rows } = payload;
  if (columns.length === 0) errors['payload.columns'] = 'Add at least one column';
  if (columns.length > TABLE_MAX_COLUMNS) {
    errors['payload.columns'] = `At most ${TABLE_MAX_COLUMNS} columns`;
  }
  columns.forEach((heading, i) => {
    if (heading === '') errors[`payload.columns.${i}`] = 'Heading is required';
  });
  if (rows.length > TABLE_MAX_ROWS) errors['payload.rows'] = `At most ${TABLE_MAX_ROWS} rows`;
  rows.forEach((row, i) => {
    if (row.length !== columns.length) {
      errors[`payload.rows.${i}`] = `Row ${i + 1} must have ${columns.length} cells`;
    }
  });
}

function checkCalc(
  payload: CalcDraftPayload,
  errors: FieldErrors,
  calcExpression: CalcExpressionCheck | undefined,
): void {
  const { fields } = payload;
  if (fields.length === 0) errors['payload.fields'] = 'Add at least one field';
  if (fields.length > CALC_MAX_FIELDS)
    errors['payload.fields'] = `At most ${CALC_MAX_FIELDS} fields`;
  const seen = new Set<string>();
  fields.forEach((field, i) => {
    const key = field.key.trim();
    const path = `payload.fields.${i}`;
    if (!CALC_KEY_RE.test(key)) {
      errors[`${path}.key`] = 'Use letters, digits and _, not starting with a digit';
    } else if (CALC_FUNCTIONS.has(key)) {
      errors[`${path}.key`] = `"${key}" is a function name`;
    } else if (seen.has(key)) {
      errors[`${path}.key`] = 'Keys must be unique';
    }
    seen.add(key);
    if (field.label === '') errors[`${path}.label`] = 'Label is required';
    const value = parseCalcDefault(field.default);
    if (value !== undefined && !Number.isFinite(value)) {
      errors[`${path}.default`] = 'Default must be a number';
    }
  });
  const expression = payload.expression.trim();
  if (expression === '') errors['payload.expression'] = 'Expression is required';
  else if (calcExpression && !errors['payload.fields']) {
    const result = calcExpression(
      expression,
      fields.map((f) => f.key.trim()),
    );
    if (!result.ok) errors['payload.expression'] = result.message;
  }
  if (payload.resultLabel === '') errors['payload.resultLabel'] = 'Result label is required';
}

/** Bytes of the payload as it will be sent. */
export function payloadBytes(draft: Pick<Draft, 'type' | 'payload'>): number {
  return utf8Bytes(JSON.stringify(toPayload(draft)));
}

/**
 * R6: client mirror of the server rules, zod- and mathjs-free. The server stays authoritative;
 * this only blocks a save that would certainly fail. Image payloads are read-only in 007.
 */
export function validateDraft(draft: Draft, options: ValidateOptions = {}): FieldErrors {
  const errors: FieldErrors = {};
  checkCommon(draft, errors, options.categoriesOptional ?? false);
  switch (draft.type) {
    case 'link':
      checkLink(draft.payload as LinkDraftPayload, errors);
      break;
    case 'table':
      checkTable(draft.payload as TablePayload, errors);
      break;
    case 'calc':
      checkCalc(draft.payload as CalcDraftPayload, errors, options.calcExpression);
      break;
    case 'text':
    case 'image':
      break;
  }
  const bytes = payloadBytes(draft);
  if (bytes > PAYLOAD_MAX_BYTES) {
    errors['payload'] = `Content is too large (${bytes} / ${PAYLOAD_MAX_BYTES} bytes)`;
  }
  return errors;
}

export function errorCount(errors: FieldErrors): number {
  return Object.values(errors).filter(Boolean).length;
}
