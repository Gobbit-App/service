import type { ReactElement } from 'react';
import type { ImagePayload, MediaPayload } from '../../cards/payload-guards';
import type { FieldErrors } from '../validate';
import { ImageFields, type ImageFieldsProps } from './ImageFields';
import type { FieldsProps } from './types';

export type MediaFieldsProps = FieldsProps<'media'> & {
  uploadDeps?: ImageFieldsProps['uploadDeps'];
};

/** The cover's error paths under the single-photo editor's names. */
function coverErrors(errors: FieldErrors): FieldErrors {
  const out: FieldErrors = { ...errors };
  const id = errors['payload.images.0.publicId'] ?? errors['payload.images'];
  if (id) out['payload.publicId'] = id;
  const alt = errors['payload.images.0.alt'];
  if (alt) out['payload.alt'] = alt;
  return out;
}

/**
 * 045 (D386, D398): a media card's editor. Until the gallery editor and the PDF, audio and video
 * pickers arrive (PR 2), it edits the card's one photo with the existing photo editor; a card of
 * another kind keeps its file untouched.
 */
export function MediaFields({
  payload,
  onChange,
  errors,
  ...rest
}: MediaFieldsProps): ReactElement {
  if (payload.kind !== 'image') {
    return <p className="muted">This file can't be changed here yet.</p>;
  }
  const cover: ImagePayload = payload.images[0] ?? { publicId: '', alt: '' };
  const change = (next: ImagePayload) =>
    onChange({ kind: 'image', images: [next, ...payload.images.slice(1)] } satisfies MediaPayload);
  return <ImageFields payload={cover} onChange={change} errors={coverErrors(errors)} {...rest} />;
}
