import type { z } from 'zod';
import {
  CARD_BODY_MAX,
  CARD_TITLE_MAX,
  EXTRACT_CONFIDENCE_MIN,
  EXTRACT_MAX_CATEGORIES,
  codePointLength,
  compactEntities,
  entityKinds,
  itemCreateSchema,
  type Entities,
  type IngestCardType,
  type ItemCreate,
} from '@pb/shared';
import { proposeCardInputSchema } from './extract-prompt';

/** Context the validator needs from the deck and the shared item. */
export interface ValidateContext {
  sourceUrl?: string;
  imagePublicId?: string;
  categoryIds: readonly string[];
}

/** Result of validating a `propose_card` tool call. */
export type ValidatedProposal =
  | {
      ok: true;
      item: ItemCreate;
      summary: {
        type: IngestCardType;
        confidence: number;
        language: string;
        categoryIds: string[];
        newCategory: string | null;
      };
    }
  | { ok: false; error: string };

const SENTENCE_END = new Set(['.', '!', '?', '…', '。', '\n']);
const ENTITY_VALUE_MAX_COUNT = 10;
const ENTITY_VALUE_MAX_CHARS = 120;
const NEW_CATEGORY_MAX_CHARS = 60;

/** Formats zod issues as `path: message` joined by `; `. */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/** Truncates text to `max` code points, preferring a sentence or word boundary. */
export function truncateAtSentence(text: string, max: number): string {
  if (codePointLength(text) <= max) {
    return text;
  }
  const chars = Array.from(text).slice(0, max);
  const half = max / 2;

  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i];
    if (ch !== undefined && i >= half && SENTENCE_END.has(ch)) {
      return chars
        .slice(0, i + 1)
        .join('')
        .trimEnd();
    }
  }

  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i];
    if (ch !== undefined && i >= half && /\s/.test(ch)) {
      return chars.slice(0, i).join('').trimEnd();
    }
  }

  return chars.join('');
}

/** Whether a proposal's confidence is too low and should be escalated. */
export function shouldEscalate(confidence: number): boolean {
  return confidence < EXTRACT_CONFIDENCE_MIN;
}

/** Message sent back to the model asking it to fix an invalid tool call. */
export function correctionMessage(error: string): string {
  return `Your previous propose_card call was invalid: ${error}. Call propose_card again with corrected fields.`;
}

/** Validates and normalizes a raw `propose_card` tool input into an `ItemCreate`. */
export function validateProposal(raw: unknown, ctx: ValidateContext): ValidatedProposal {
  const parsed = proposeCardInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  const input = parsed.data;

  const title = truncateAtSentence(input.title.trim(), CARD_TITLE_MAX);
  const body = truncateAtSentence(input.body.trim(), CARD_BODY_MAX);

  const allowed = new Set(ctx.categoryIds);
  const seen = new Set<string>();
  const categoryIds: string[] = [];
  for (const id of input.categoryIds) {
    if (categoryIds.length >= EXTRACT_MAX_CATEGORIES) break;
    if (allowed.has(id) && !seen.has(id)) {
      seen.add(id);
      categoryIds.push(id);
    }
  }

  const entities: Entities = {};
  for (const kind of entityKinds) {
    const values = (input.entities?.[kind] ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, ENTITY_VALUE_MAX_COUNT)
      .map((value) => value.slice(0, ENTITY_VALUE_MAX_CHARS));
    if (values.length > 0) {
      entities[kind] = values;
    }
  }
  const compacted = compactEntities(entities);

  const url = input.link?.url || ctx.sourceUrl || undefined;
  let type: IngestCardType = input.type;
  if (type === 'link' && !url) {
    type = 'text';
  }
  if (type === 'image' && !ctx.imagePublicId) {
    type = url ? 'link' : 'text';
  }

  let payload: Record<string, unknown> = {};
  if (type === 'link' && url) {
    payload = { url };
  } else if (type === 'image' && ctx.imagePublicId) {
    payload = { publicId: ctx.imagePublicId, alt: title || 'Shared image' };
  }

  const candidate: Record<string, unknown> = {
    title,
    body,
    categoryIds,
    entities: compacted,
    status: 'proposed',
    type,
    ...(ctx.sourceUrl !== undefined ? { sourceUrl: ctx.sourceUrl } : {}),
    payload,
  };

  const item = itemCreateSchema.safeParse(candidate);
  if (!item.success) {
    return { ok: false, error: formatZodError(item.error) };
  }

  const trimmedNewCategory = input.newCategory?.trim();
  const newCategory = trimmedNewCategory
    ? trimmedNewCategory.slice(0, NEW_CATEGORY_MAX_CHARS)
    : null;

  return {
    ok: true,
    item: item.data,
    summary: {
      type,
      confidence: input.confidence,
      language: input.language,
      categoryIds,
      newCategory,
    },
  };
}
