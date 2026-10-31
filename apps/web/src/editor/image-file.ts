import {
  MEDIA_IMAGE_EXTENSIONS,
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_IMAGE_MIMES,
} from '@gobbit/shared/media-constants';

/** `accept` for the file inputs; extensions too, because iOS may report HEIC with no type. */
export const IMAGE_ACCEPT = [
  ...MEDIA_IMAGE_MIMES,
  ...MEDIA_IMAGE_EXTENSIONS.map((e) => `.${e}`),
].join(',');

const MAX_MB = Math.round(MEDIA_IMAGE_MAX_BYTES / (1024 * 1024));

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function isAllowedType(file: Pick<File, 'name' | 'type'>): boolean {
  if (file.type !== '') return (MEDIA_IMAGE_MIMES as readonly string[]).includes(file.type);
  return (MEDIA_IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(file.name));
}

/** FR-004: refuses a file before any upload starts; null when it may be uploaded. */
export function checkImageFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!isAllowedType(file)) return 'Choose a JPEG, PNG, WebP or HEIC photo.';
  if (file.size > MEDIA_IMAGE_MAX_BYTES) return `The photo must be at most ${MAX_MB} MB.`;
  return null;
}
