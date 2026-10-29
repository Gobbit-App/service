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
  type LinkPayload,
  type LinkPreview,
} from '@gobbit/shared';
import { LOCKED_CAPTION_MAX, type LockedHostMatch } from '@gobbit/shared/links';
import { isGenericLockedTitle } from '../fetch/locked-host-preview';
import { proposeCardInputSchema } from './extract-prompt';

/** Context the validator needs from the deck and the shared item. */
export interface ValidateContext {
  sourceUrl?: string;
  imagePublicId?: string;
  /** D163: the shared page's clipped OG preview; used when the card links to `sourceUrl`. */
  linkPreview?: LinkPreview;
  /** D167: `sourceUrl` is on a locked social host; the card links to it with the shared content. */
  lockedHost?: LockedHostMatch | null;
  /** D167: the raw shared text (the post's caption for locked hosts). */
  sharedText?: string;
  /** D160: the recorded dimensions of `imagePublicId`, when known. */
  imageDimensions?: { width: number; height: number } | null;
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

/** The shared text without the shared URL in it, trimmed to the caption limit. */
function captionOf(text: string | undefined, url: string): string | undefined {
  const caption = text?.replaceAll(url, ' ').replace(/\s+/gu, ' ').trim();
  return caption ? truncateAtSentence(caption, LOCKED_CAPTION_MAX) : undefined;
}

/**
 * D167: a locked host's page tells the server nothing, so the preview is what the member shared:
 * the OG title unless it only names the site (else the card title), the OG description or the
 * caption, and the first shared image as the stored copy (no remote `image` to snapshot then).
 */
function lockedPreview(
  url: string,
  title: string,
  ctx: ValidateContext & { lockedHost: LockedHostMatch },
): NonNullable<LinkPayload['preview']> {
  const og = ctx.linkPreview;
  const genericOg = isGenericLockedTitle(og?.title, ctx.lockedHost);
  const previewTitle = !genericOg && og?.title ? og.title : title;
  const description = (!genericOg && og?.description) || captionOf(ctx.sharedText, url);
  const image = ctx.imagePublicId
    ? { publicId: ctx.imagePublicId, ...(ctx.imageDimensions ?? {}) }
    : !genericOg && og?.image
      ? { image: og.image }
      : {};
  return {
    ...(previewTitle ? { title: previewTitle } : {}),
    ...(description ? { description } : {}),
    ...image,
  };
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

  const lockedHost = ctx.sourceUrl ? (ctx.lockedHost ?? null) : null;
  const url = (lockedHost && ctx.sourceUrl) || input.link?.url || ctx.sourceUrl || undefined;
  let type: IngestCardType = lockedHost ? 'link' : input.type;
  if (type === 'link' && !url) {
    type = 'text';
  }
  if (type === 'image' && !ctx.imagePublicId) {
    type = url ? 'link' : 'text';
  }

  let payload: Record<string, unknown> = {};
  if (type === 'link' && url && lockedHost) {
    payload = { url, preview: lockedPreview(url, title, { ...ctx, lockedHost }) };
  } else if (type === 'link' && url) {
    payload =
      ctx.linkPreview && url === ctx.sourceUrl ? { url, preview: ctx.linkPreview } : { url };
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
