import {
  CARD_BODY_MAX,
  CARD_TITLE_MAX,
  codePointLength,
  itemCreateSchema,
  type IngestChannel,
  type IngestRaw,
  type IngestRawFile,
  type ItemCreateResolved,
  type MediaTitleSource,
} from '@gobbit/shared';

/** The title a share gets when it says nothing at all about its file. */
const KIND_TITLE: Record<IngestRawFile['kind'], string> = {
  pdf: 'Shared PDF',
  audio: 'Shared audio',
  video: 'Shared video',
};

export interface MediaProposal {
  item: ItemCreateResolved;
  titleSource: MediaTitleSource;
  /** D395: the share text kept as the caption, dropped for being too long, or there was none. */
  body: 'kept' | 'dropped_too_long' | 'none';
}

function cut(text: string, max: number): string {
  const points = [...text];
  return points.length <= max
    ? text
    : `${points
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}

function withoutExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).replace(/[_]+/g, ' ').trim();
}

/**
 * D395: a PDF, audio or video share as a proposal, with no model call. Title: the share's title
 * (an email's subject), else the first line of its text, else the file name without extension,
 * else the kind. Caption: the rest of the text when it fits the body limit, otherwise none (the
 * text is never cut; the drop is logged). The card's facts come from the server upload.
 */
export function buildMediaProposal(raw: IngestRaw, channel: IngestChannel): MediaProposal | null {
  const file = raw.file;
  if (!file) return null;

  const text = raw.text?.trim() ?? '';
  let title = raw.title?.trim() ?? '';
  let titleSource: MediaTitleSource = channel === 'email' ? 'subject' : 'title';
  let rest = text;
  if (title === '' && text !== '') {
    const [first, ...lines] = text.split(/\r?\n/);
    title = (first ?? '').trim();
    rest = lines.join('\n').trim();
    titleSource = 'text';
  }
  if (title === '' && file.fileName) {
    title = withoutExtension(file.fileName);
    titleSource = 'filename';
  }
  if (title === '') {
    title = KIND_TITLE[file.kind];
    titleSource = 'kind';
  }

  const fits = rest !== '' && codePointLength(rest) <= CARD_BODY_MAX;
  const body = fits ? rest : '';
  const bodyOutcome: MediaProposal['body'] =
    rest === '' ? 'none' : fits ? 'kept' : 'dropped_too_long';

  const payload: Record<string, unknown> = { kind: file.kind, publicId: file.publicId };
  if (file.width && file.height) {
    payload['width'] = file.width;
    payload['height'] = file.height;
  }
  if (file.durationMs) payload['durationMs'] = file.durationMs;
  if (file.pages) payload['pages'] = file.pages;
  if (file.fileName) payload['fileName'] = [...file.fileName].slice(0, 200).join('');

  const parsed = itemCreateSchema.safeParse({
    type: 'media',
    title: cut(title, CARD_TITLE_MAX),
    body,
    status: 'proposed',
    payload,
    ...(raw.url && /^https?:\/\//i.test(raw.url) ? { sourceUrl: raw.url } : {}),
  });
  if (!parsed.success) return null;
  return { item: parsed.data as ItemCreateResolved, titleSource, body: bodyOutcome };
}
