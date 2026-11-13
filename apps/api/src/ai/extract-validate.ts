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
  type EventDateSource,
  type EventZoneSource,
  type IngestCardType,
  type ItemCreate,
  type LinkPayload,
  type LinkPreview,
} from '@gobbit/shared';
import { LOCKED_CAPTION_MAX, type LockedHostMatch } from '@gobbit/shared/links';
import { isGenericLockedTitle } from '../fetch/locked-host-preview';
import { stripStyleDirectives } from '../rich-text/plain-text';
import { proposeEvent, type EventContext, type EventDecision } from './extract-event';
import { proposeCardInputSchema, type ProposeCardInput } from './extract-prompt';

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
  /** D370: event rules for this share; without it a proposed event becomes a link or text card. */
  event?: EventContext;
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
        /** D375: set when the card is an event. */
        event?: { dateSource: EventDateSource; zoneSource: EventZoneSource };
      };
      /** D378: set whenever the share was tried as an event. */
      eventDecision?: EventDecision;
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

/** D348: what a locked-host card says when nothing about its content could be read. */
export function honestLockedText(label: string): { title: string; body: string } {
  return { title: `${label} link`, body: `Shared from ${label}; its content couldn't be read.` };
}

/** The page's preview title when it names the content, not the site or a wall (D347). */
function realLockedTitle(ctx: ValidateContext & { lockedHost: LockedHostMatch }): string | null {
  const title = ctx.linkPreview?.title;
  return title && !isGenericLockedTitle(title, ctx.lockedHost) ? title : null;
}

/**
 * D348: a locked-host share with neither a real page title nor a caption: the code, not the
 * model, writes the card's title and body, so it never guesses what the post is.
 */
export function needsHonestLockedText(ctx: ValidateContext): boolean {
  const lockedHost = ctx.sourceUrl ? (ctx.lockedHost ?? null) : null;
  if (!lockedHost || !ctx.sourceUrl) return false;
  return !realLockedTitle({ ...ctx, lockedHost }) && !captionOf(ctx.sharedText, ctx.sourceUrl);
}

/**
 * D167/D347: the locked host's preview: the page title when it is real (else the card title), the
 * member's caption before the page description, and the first shared image as the stored copy
 * (else the page image). The builder already discarded a wall or unavailable page whole.
 */
function lockedPreview(
  url: string,
  title: string,
  ctx: ValidateContext & { lockedHost: LockedHostMatch },
): NonNullable<LinkPayload['preview']> {
  const og = ctx.linkPreview;
  const realTitle = realLockedTitle(ctx);
  const caption = captionOf(ctx.sharedText, url);
  const description = caption || (realTitle ? og?.description : undefined);
  const previewTitle = realTitle ?? title;
  const image = ctx.imagePublicId
    ? { publicId: ctx.imagePublicId, ...(ctx.imageDimensions ?? {}) }
    : realTitle && og?.image
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

  // D348: a locked share nothing could be read from gets the code's honest title and body.
  const honest =
    ctx.lockedHost && needsHonestLockedText(ctx) ? honestLockedText(ctx.lockedHost.label) : null;
  const title = honest?.title ?? truncateAtSentence(input.title.trim(), CARD_TITLE_MAX);
  // D288: the agent never styles a card; directives it writes become their plain labels.
  const body =
    honest?.body ?? truncateAtSentence(stripStyleDirectives(input.body.trim()), CARD_BODY_MAX);

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
  const linkPreview = ctx.linkPreview && url === ctx.sourceUrl ? ctx.linkPreview : undefined;
  const plainType = (type: IngestCardType): Exclude<IngestCardType, 'event'> => {
    if (type === 'image' && ctx.imagePublicId) return 'image';
    if (type === 'text') return 'text';
    return url ? 'link' : 'text';
  };

  let type: IngestCardType = lockedHost ? 'link' : plainType(input.type);
  let payload = plainPayload(type, { url, title, lockedHost, linkPreview, ctx });
  let eventDecision: EventDecision | undefined;
  if (!lockedHost && ctx.event && wantsEvent(input, ctx.event)) {
    const proposed = proposeEvent(input, ctx.event, { url, preview: linkPreview });
    eventDecision = proposed.decision;
    if (proposed.ok) {
      type = 'event';
      payload = proposed.payload;
    }
  }

  const candidate = (t: IngestCardType, p: Record<string, unknown>): Record<string, unknown> => ({
    title,
    body,
    categoryIds,
    entities: compacted,
    status: 'proposed',
    type: t,
    ...(ctx.sourceUrl !== undefined ? { sourceUrl: ctx.sourceUrl } : {}),
    payload: p,
  });

  let item = itemCreateSchema.safeParse(candidate(type, payload));
  if (!item.success && type === 'event') {
    // D370: an event the schema refuses becomes a link or text card, with no correction round trip.
    eventDecision = { outcome: 'event_fallback', reason: 'invalid_event' };
    type = plainType('link');
    payload = plainPayload(type, { url, title, lockedHost, linkPreview, ctx });
    item = itemCreateSchema.safeParse(candidate(type, payload));
  }
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
      ...(eventDecision?.outcome === 'event_proposed'
        ? {
            event: {
              dateSource: eventDecision.dateSource,
              zoneSource: eventDecision.zoneSource,
            },
          }
        : {}),
    },
    ...(eventDecision ? { eventDecision } : {}),
  };
}

/** D370: the model picked an event, or the page has one schema.org Event (unless it's a photo). */
function wantsEvent(input: ProposeCardInput, ctx: EventContext): boolean {
  return input.type === 'event' || (ctx.structured !== undefined && input.type !== 'image');
}

/** The payload of a text, link or image card. */
function plainPayload(
  type: IngestCardType,
  p: {
    url: string | undefined;
    title: string;
    lockedHost: LockedHostMatch | null;
    linkPreview: LinkPreview | undefined;
    ctx: ValidateContext;
  },
): Record<string, unknown> {
  if (type === 'link' && p.url && p.lockedHost) {
    return {
      url: p.url,
      preview: lockedPreview(p.url, p.title, { ...p.ctx, lockedHost: p.lockedHost }),
    };
  }
  if (type === 'link' && p.url) {
    return p.linkPreview ? { url: p.url, preview: p.linkPreview } : { url: p.url };
  }
  if (type === 'image' && p.ctx.imagePublicId) {
    return { publicId: p.ctx.imagePublicId, alt: p.title || 'Shared image' };
  }
  return {};
}
