import { INGEST_IMAGE_MIMES, INGEST_MAX_IMAGES } from '@pb/shared/ingest-constants';

/** D98: how long a shared payload waits in IndexedDB for the confirm screen. */
export const SHARE_TTL_MS = 60 * 60 * 1000;

/** What Android's share sheet handed us (D98), kept until the user confirms on `/share`. */
export type SharedPayload = {
  id: string;
  createdAt: number;
  title: string;
  text: string;
  url: string;
  files: File[];
};

const IMAGE_MIMES: ReadonlySet<string> = new Set(INGEST_IMAGE_MIMES);

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Images the API accepts, at most `INGEST_MAX_IMAGES`; anything else is dropped. */
export function acceptedImages(files: readonly unknown[]): File[] {
  return files
    .filter((f): f is File => f instanceof File && IMAGE_MIMES.has(f.type) && f.size > 0)
    .slice(0, INGEST_MAX_IMAGES);
}

/** True for an absolute http(s) URL. */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Many Android apps put the link in `text` (sometimes after a caption) and leave `url` empty.
 * A `text` that is only a URL becomes the URL; a caption + URL is left as text (the worker
 * reads URLs out of the text).
 */
export function normalizeShared(input: { title: string; text: string; url: string }): {
  title: string;
  text: string;
  url: string;
} {
  if (input.url || !isHttpUrl(input.text)) return input;
  return { ...input, text: '', url: input.text };
}

/** Builds the stored payload from the share target's multipart POST. */
export function payloadFromFormData(form: FormData, id: string, now: number): SharedPayload {
  const shared = normalizeShared({
    title: field(form, 'title'),
    text: field(form, 'text'),
    url: field(form, 'url'),
  });
  return { id, createdAt: now, ...shared, files: acceptedImages(form.getAll('files')) };
}

export function isExpired(payload: Pick<SharedPayload, 'createdAt'>, now: number): boolean {
  return now - payload.createdAt > SHARE_TTL_MS;
}

/** Something the API will take: text, a URL or at least one image. */
export function hasContent(draft: { text: string; url: string; files: readonly File[] }): boolean {
  return draft.text.trim() !== '' || draft.url.trim() !== '' || draft.files.length > 0;
}

export type IngestDraft = {
  deckId: string;
  title: string;
  text: string;
  url: string;
  files: readonly File[];
  channel: 'pwa' | 'paste';
};

/** The multipart body for `POST /ingest`; empty fields are left out. */
export function buildIngestForm(draft: IngestDraft): FormData {
  const form = new FormData();
  form.set('deckId', draft.deckId);
  form.set('channel', draft.channel);
  for (const name of ['title', 'text', 'url'] as const) {
    const value = draft[name].trim();
    if (value) form.set(name, value);
  }
  for (const file of draft.files) form.append('files', file, file.name);
  return form;
}
