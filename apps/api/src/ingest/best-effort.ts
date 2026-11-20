import { CARD_BODY_MAX, codePointLength } from '@gobbit/shared';
import type { IngestChannel, IngestRaw } from '@gobbit/shared';
import { lockedHostOf } from '@gobbit/shared/links';
import type { ProposeCardInput } from '../ai/extract-prompt';
import type { ValidateContext } from '../ai/extract-validate';
import { hostOf } from './preview-fallback';

/** D454/D455: the card a share becomes when smart share is off for the sharer (no model). */
export type BestEffortKind = 'link' | 'media' | 'text';

export interface BestEffort {
  kind: BestEffortKind;
  input: ProposeCardInput;
  /** The intended body was over `CARD_BODY_MAX`; the validator shortens it. */
  cut: boolean;
  /** Photos not used because a web address won. */
  unusedPhotos: number;
  /**
   * The link kind needs the page: the handler (T013) runs `normalize` and overrides the title
   * (page title first) and, when the sender wrote nothing, the body (page description). This
   * pure builder only knows the share title or site name.
   */
  needsPreview: boolean;
}

/** First line as the title, the rest as the body, unless the share has its own title. */
function titleAndBody(raw: IngestRaw, text: string, fallbackTitle: string) {
  const title = raw.title?.trim();
  if (title) return { title, body: text };
  const [first = '', ...rest] = text.split('\n');
  return first.trim()
    ? { title: first.trim(), body: rest.join('\n').trim() }
    : { title: fallbackTitle, body: text };
}

/** D455 kind rules; null when there is nothing usable. */
export function bestEffort(
  raw: IngestRaw,
  channel: IngestChannel,
  sourceUrl?: string,
): BestEffort | null {
  const text = raw.text?.trim() ?? '';
  const url = sourceUrl ?? raw.url;
  const withoutUrl = url ? text.split(url).join('').trim() : text;
  const photos = raw.images.length > 0;

  let kind: BestEffortKind | null;
  if (channel === 'email') {
    kind = photos ? 'media' : url && !withoutUrl ? 'link' : text ? 'text' : null;
  } else {
    kind = url ? 'link' : photos ? 'media' : text ? 'text' : null;
  }
  if (!kind) return null;

  let title: string;
  let body: string;
  let link: ProposeCardInput['link'];
  if (kind === 'link') {
    title = raw.title?.trim() || hostOf(url!);
    body = withoutUrl;
    link = { url: url! };
  } else {
    ({ title, body } = titleAndBody(raw, text, kind === 'media' ? 'Shared image' : ''));
  }
  return {
    kind,
    input: {
      type: kind === 'link' ? 'link' : kind === 'media' ? 'image' : 'text',
      title,
      body,
      ...(link ? { link } : {}),
      categoryIds: [],
      language: 'und',
      confidence: 0,
    },
    cut: codePointLength(body) > CARD_BODY_MAX,
    unusedPhotos: kind === 'link' ? raw.images.length : 0,
    needsPreview: kind === 'link',
  };
}

/** The validator context per kind: never a category or event; link and photo fields only where they apply. */
export function bestEffortContext(
  kind: BestEffortKind,
  raw: IngestRaw,
  base: ValidateContext,
): ValidateContext {
  if (kind === 'link') {
    const { sourceUrl, linkPreview } = base;
    return {
      categoryIds: [],
      ...(sourceUrl ? { sourceUrl, lockedHost: lockedHostOf(sourceUrl) } : {}),
      ...(linkPreview ? { linkPreview } : {}),
      ...(raw.text ? { sharedText: raw.text } : {}),
    };
  }
  if (kind === 'media') {
    const [cover, ...more] = raw.images;
    return {
      categoryIds: [],
      ...(cover
        ? { imagePublicId: cover.publicId, morePublicIds: more.map((i) => i.publicId) }
        : {}),
      ...(base.imageDimensions ? { imageDimensions: base.imageDimensions } : {}),
    };
  }
  return { categoryIds: [] };
}
