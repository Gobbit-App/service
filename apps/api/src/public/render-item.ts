import {
  calcPayloadSchema,
  imagePayloadSchema,
  linkPayloadSchema,
  tablePayloadSchema,
  type CalcPayload,
  type PublicItem,
} from '@gobbit/shared';
import { evaluateCalc, formatCalcResult } from '@gobbit/shared/calc';
import { imageAlt } from '@gobbit/shared/image-alt';
import type { EventPublicPayload } from '@gobbit/shared/event-constants';
import { eventWhenLine } from './event-summary';
import { h, type Html } from './html';
import { renderMarkdown } from './markdown';

/** Cloudinary URL for a stored image, or null when media isn't configured. */
export type ImageUrlFor = (publicId: string, transformation: string) => string | null;

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
  return item.body.trim() ? h`<div class="body">${renderMarkdown(item.body)}</div>` : '';
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

function renderImage(item: PublicItem, imageUrl: ImageUrlFor): Html | string {
  const parsed = imagePayloadSchema.safeParse(item.payload);
  if (!parsed.success) return '';
  const { publicId, alt, width, height } = parsed.data;
  const src = imageUrl(publicId, PAGE_IMAGE_TRANSFORMATION);
  if (!src) return alt?.trim() ? h`<p class="muted">${alt.trim()}</p>` : '';
  // D206: the title is right above the figure, so an image without a description is decorative.
  const altText = imageAlt({ alt, title: item.title, titleAdjacent: true });
  return h`<figure><img src="${src}" alt="${altText}"${
    width && height ? h` width="${width}" height="${height}"` : ''
  }></figure>`;
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
export function renderItem(item: PublicItem, imageUrl: ImageUrlFor): Html {
  let content: Html | string = '';
  switch (item.type) {
    case 'link':
      content = renderLink(item, imageUrl);
      break;
    case 'image':
      content = renderImage(item, imageUrl);
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
