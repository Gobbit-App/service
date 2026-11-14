import {
  MEDIA_FORMATS,
  MEDIA_MAX_BYTES_DEFAULTS,
  type MediaMaxBytes,
} from '@gobbit/shared/media-constants';
import type { MediaKind } from '@gobbit/shared';
import { checkImageFile } from './image-file';

/** `accept` for the PDF, audio and video picker (045, D389); iOS may report no type. */
export const FILE_ACCEPT = [
  'application/pdf',
  'audio/*',
  'video/*',
  ...[...MEDIA_FORMATS.pdf, ...MEDIA_FORMATS.audio, ...MEDIA_FORMATS.video].map((e) => `.${e}`),
].join(',');

const KIND_NAME: Record<MediaKind, string> = {
  image: 'photo',
  pdf: 'PDF',
  audio: 'audio file',
  video: 'video',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * The kind a picked file will be stored as, from its type or (when the device gives none) its
 * extension; null when no kind takes it. The server decides from the stored format (D390).
 */
export function kindOfFile(file: Pick<File, 'name' | 'type'>): MediaKind | null {
  const type = file.type.toLowerCase();
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/'))
    return checkImageFile({ name: file.name, type: file.type, size: 0 }) ? null : 'image';
  const ext = extensionOf(file.name) === 'jpeg' ? 'jpg' : extensionOf(file.name);
  for (const kind of ['image', 'pdf', 'audio', 'video'] as const) {
    if ((MEDIA_FORMATS[kind] as readonly string[]).includes(ext)) return kind;
  }
  return null;
}

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * FR-008: refuses a file before any upload starts (the limit shown), null when it may be
 * uploaded. Limits come from `/config` (operator settings), else the defaults.
 */
export function checkMediaFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
  limits: MediaMaxBytes = MEDIA_MAX_BYTES_DEFAULTS,
): string | null {
  const kind = kindOfFile(file);
  if (!kind) return 'Choose a photo, a PDF, or an audio or video file.';
  if (kind === 'image') {
    const refused = checkImageFile({ name: file.name, type: file.type, size: 0 });
    if (refused) return refused;
  }
  if (file.size > limits[kind]) {
    const tip = kind === 'video' ? ' Choose a shorter clip or a smaller size.' : '';
    return `The ${KIND_NAME[kind]} must be at most ${megabytes(limits[kind])}.${tip}`;
  }
  return null;
}
