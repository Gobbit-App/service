import {
  calcPayloadSchema,
  linkPayloadSchema,
  tablePayloadSchema,
  type CalcPayload,
  type PublicItem,
} from '@gobbit/shared';
import { evaluateCalc, formatCalcResult } from '@gobbit/shared/calc';
import { imageAlt } from '@gobbit/shared/image-alt';
import {
  MEDIA_DELIVERY,
  mediaImagesOf,
  mediaKindOf,
  type MediaRendition,
} from '@gobbit/shared/media-constants';
import { FLOW_CLASS } from '@gobbit/shared/rich-text';
import type { EventPublicPayload } from '@gobbit/shared/event-constants';
import { eventWhenLine } from './event-summary';
import { h, type Html } from './html';
import { renderMarkdown } from './markdown';

/** Cloudinary URL for a stored image, or null when media isn't configured. */
export type ImageUrlFor = (publicId: string, transformation: string) => string | null;

/** 045: URL of one rendition of a stored file (any resource type), or null without storage. */
export type MediaUrlFor = (rendition: MediaRendition, publicId: string) => string | null;

/** D177: card photos are width-limited; the browser scales them down further. */
export const PAGE_IMAGE_TRANSFORMATION = 'c_limit,w_1280,f_auto,q_auto';

/** D177: user links on a public origin are never endorsed and never get the opener. */
export const USER_LINK_REL = 'nofollow ugc noopener';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function body(item: PublicItem): Html | string {
  return item.body.trim()
    ? h`<div class="body ${FLOW_CLASS}">${renderMarkdown(item.body)}</div>`
    : '';
}

type LinkFields = Pick<EventPublicPayload, 'url' | 'preview'> & { url: string };

/** A link with its preview (link cards, and an event's optional link). */
function renderLinkFields({ url, preview }: LinkFields, imageUrl: ImageUrlFor): Html {
  // ADR-055: the stored snapshot first, the remote image only as a fallback.
  const image = preview?.publicId
    ? imageUrl(preview.publicId, PAGE_IMAGE_TRANSFORMATION)
    : (preview?.image ?? null);
  return h`<p><a href="${url}" rel="${USER_LINK_REL}">${preview?.title || url}</a>
<br><span class="link-host">${hostOf(url)}</span></p>
${preview?.description ? h`<p class="muted">${preview.description}</p>` : ''}
${
  image
    ? h`<figure><img src="${image}" alt="" loading="lazy"${
        preview?.width && preview.height
          ? h` width="${preview.width}" height="${preview.height}"`
          : ''
      }></figure>`
    : ''
}`;
}

function renderLink(item: PublicItem, imageUrl: ImageUrlFor): Html | string {
  const parsed = linkPayloadSchema.safeParse(item.payload);
  return parsed.success ? renderLinkFields(parsed.data, imageUrl) : '';
}

/** D367: the date and time in the event's own zone, the location and the link; no status. */
function renderEvent(item: PublicItem, imageUrl: ImageUrlFor): Html | string {
  const payload = item.payload as unknown as EventPublicPayload;
  const when = eventWhenLine(payload);
  if (!when) return '';
  return h`<p class="event-when">${when}</p>
${payload.location?.trim() ? h`<p class="event-location">${payload.location.trim()}</p>` : ''}
${payload.url ? renderLinkFields({ url: payload.url, preview: payload.preview }, imageUrl) : ''}`;
}

/** `m:ss` (or `h:mm:ss`) for a duration in milliseconds. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * D397: a PDF, video or audio card without scripts: the browser's own player (never autoplay,
 * nothing loaded before play), or a PDF's first page linked to the original. Unavailable without
 * media storage.
 */
function renderFile(item: PublicItem, mediaUrl: MediaUrlFor | undefined): Html | string {
  const kind = mediaKindOf(item.payload);
  const p = item.payload as {
    publicId?: unknown;
    alt?: unknown;
    width?: unknown;
    height?: unknown;
    durationMs?: unknown;
    pages?: unknown;
  };
  if (typeof p.publicId !== 'string' || p.publicId === '' || kind === null) return '';
  const id = p.publicId;
  const url = (r: Parameters<MediaUrlFor>[0]) => (mediaUrl ? mediaUrl(r, id) : null);
  const alt = typeof p.alt === 'string' ? p.alt : undefined;
  const size =
    typeof p.width === 'number' && typeof p.height === 'number'
      ? h` width="${p.width}" height="${p.height}"`
      : '';
  const duration = typeof p.durationMs === 'number' ? formatDuration(p.durationMs) : null;
  const unavailable = h`<p class="muted">File unavailable</p>`;

  if (kind === 'video') {
    const src = url(MEDIA_DELIVERY.videoStream);
    const poster = url(MEDIA_DELIVERY.videoStill(1080));
    if (!src || !poster) return unavailable;
    const label = imageAlt({ alt, title: item.title, titleAdjacent: false });
    return h`<figure class="media"><video controls playsinline preload="none" poster="${poster}"${size} aria-label="${label}"><source src="${src}" type="video/mp4"><a href="${src}">Download the video</a></video>${
      duration ? h`<figcaption class="muted">Video · ${duration}</figcaption>` : ''
    }</figure>`;
  }
  if (kind === 'audio') {
    const src = url(MEDIA_DELIVERY.audioStream);
    if (!src) return unavailable;
    const label = imageAlt({ alt, title: item.title, titleAdjacent: false });
    return h`<figure class="media"><audio controls preload="none" aria-label="${label}"><source src="${src}" type="audio/mpeg"><a href="${src}">Download the audio</a></audio>${
      duration ? h`<figcaption class="muted">Audio · ${duration}</figcaption>` : ''
    }</figure>`;
  }
  // PDF: page 1 as a picture, linked to the original (needs the account's PDF delivery, D391).
  const page = url(MEDIA_DELIVERY.pdfPage(1, 1080));
  const original = url(MEDIA_DELIVERY.pdfOriginal);
  if (!page || !original) return unavailable;
  const pages = typeof p.pages === 'number' ? p.pages : null;
  const altText = imageAlt({ alt, title: item.title, titleAdjacent: true });
  return h`<figure class="media"><a href="${original}" rel="${USER_LINK_REL}"><img src="${page}" alt="${altText}"${size} loading="lazy"></a><figcaption class="muted"><a href="${original}" rel="${USER_LINK_REL}">Open the PDF</a>${
    pages ? h` · ${pages === 1 ? '1 page' : `${pages} pages`}` : ''
  }</figcaption></figure>`;
}

/** D398: every photo of a photo card, in order; a single photo renders exactly as before 045. */
function renderImages(item: PublicItem, imageUrl: ImageUrlFor): Html | string {
  const photos = mediaImagesOf(item.payload);
  return h`${photos.map(({ publicId, alt, width, height }) => {
    const src = imageUrl(publicId, PAGE_IMAGE_TRANSFORMATION);
    if (!src) return alt?.trim() ? h`<p class="muted">${alt.trim()}</p>` : '';
    // D206: the title is right above the figure, so an image without a description is decorative.
    const altText = imageAlt({ alt, title: item.title, titleAdjacent: true });
    return h`<figure><img src="${src}" alt="${altText}"${
      width && height ? h` width="${width}" height="${height}"` : ''
    }></figure>`;
  })}`;
}

function renderTable(item: PublicItem): Html | string {
  const parsed = tablePayloadSchema.safeParse(item.payload);
  if (!parsed.success) return '';
  const { columns, rows } = parsed.data;
  return h`<div class="table"><table>
<thead><tr>${columns.map((c) => h`<th scope="col">${c}</th>`)}</tr></thead>
<tbody>${rows.map((row) => h`<tr>${row.map((cell) => h`<td>${cell}</td>`)}</tr>`)}</tbody>
</table></div>`;
}

/** D177: the result with every field at its default, or null when a default is missing. */
export function defaultCalcResult(payload: CalcPayload): string | null {
  const values = Object.fromEntries(payload.fields.map((f) => [f.key, f.default]));
  const result = evaluateCalc(payload.expression, values);
  return result.ok ? formatCalcResult(result.value) : null;
}

function renderCalc(item: PublicItem): Html | string {
  const parsed = calcPayloadSchema.safeParse(item.payload);
  if (!parsed.success) return '';
  const payload = parsed.data;
  const result = defaultCalcResult(payload);
  return h`<dl class="calc">
${payload.fields.map(
  (f) => h`<dt>${f.label}</dt><dd>${f.default ?? '—'}${f.unit ? h` ${f.unit}` : ''}</dd>`,
)}
<dt>${payload.resultLabel}</dt><dd class="result">${result ?? '—'}</dd>
</dl>
<p class="muted">Open the card in the app to change the values.</p>`;
}

/** D177: the full card on its own page: per-type content, then the markdown body. */
export function renderItem(item: PublicItem, imageUrl: ImageUrlFor, mediaUrl?: MediaUrlFor): Html {
  let content: Html | string = '';
  switch (item.type) {
    case 'link':
      content = renderLink(item, imageUrl);
      break;
    case 'media':
      // D397: photos in order; a PDF, video or audio file through `renderFile`.
      content =
        mediaKindOf(item.payload) === 'image'
          ? renderImages(item, imageUrl)
          : renderFile(item, mediaUrl);
      break;
    case 'table':
      content = renderTable(item);
      break;
    case 'calc':
      content = renderCalc(item);
      break;
    case 'event':
      content = renderEvent(item, imageUrl);
      break;
    case 'text':
      break;
  }
  return h`<article class="card">
<h1>${item.title}</h1>
${content}
${body(item)}
</article>`;
}
