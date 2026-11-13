import { useEffect, useRef, useState, type ReactElement } from 'react';
import { MEDIA_GALLERY_MAX } from '@gobbit/shared/media-constants';
import type { MediaAsset } from '@gobbit/shared';
import { ImageCard } from '../../cards/ImageCard';
import { useCloudName } from '../../cards/use-cloud-name';
import type { MediaImagesPayload, MediaPayload } from '../../cards/payload-guards';
import { Button } from '../../ui/buttons/Button';
import { IconButton } from '../../ui/buttons/IconButton';
import { checkMediaFile, kindOfFile, FILE_ACCEPT } from '../media-file';
import {
  describePhoto,
  movePhoto,
  photoOf,
  uploadedPhotos,
  withoutPhotoAt,
  withPhotos,
} from '../media-payload';
import { useGalleryUploads, type PendingPhoto } from '../use-gallery-uploads';
import type { UseImageUploadOptions } from '../use-image-upload';
import { useMediaLimits } from '../use-media-limits';
import { usePasteImage } from '../use-paste-image';
import type { FieldErrors } from '../validate';
import { PickButton } from './PickButton';
import { TextInput } from './TextInput';

/** D206: who the optional description helps, and what happens without it. */
export const IMAGE_DESCRIPTION_HINT =
  'Helps people who use a screen reader. Leave empty to use the card title.';

export type GalleryFieldsProps = {
  payload: MediaImagesPayload;
  onChange: (next: MediaPayload) => void;
  errors: FieldErrors;
  deckId: string;
  disabled: boolean;
  /** False offline: nothing can be uploaded. */
  online: boolean;
  /** Reports whether a photo is still on its way (Save waits, D398). */
  onBusyChange: (busy: boolean) => void;
  /** With an empty gallery, a PDF, audio or video file can be chosen instead (045). */
  onPickFile?: (file: File) => void;
  uploadDeps?: Pick<UseImageUploadOptions, 'signer' | 'upload' | 'confirm'>;
};

function progressLabel(entry: PendingPhoto): string {
  if (entry.status === 'confirming') return 'Saving photo…';
  if (entry.status === 'uploading' && entry.percent !== null) {
    return `Uploading… ${entry.percent}%`;
  }
  return 'Preparing upload…';
}

/**
 * D398: a photo card's photos (1–8, the first is the cover). Pick several at once, take one
 * with the camera or paste one; each uploads on its own and joins the gallery once confirmed.
 * Describe, move earlier/later or remove each photo (no drag library). Saving waits for uploads.
 */
export function GalleryFields({
  payload,
  onChange,
  errors,
  deckId,
  disabled,
  online,
  onBusyChange,
  onPickFile,
  uploadDeps,
}: GalleryFieldsProps): ReactElement {
  const cloudName = useCloudName();
  const limits = useMediaLimits();
  const [notice, setNotice] = useState<string | null>(null);
  const photos = uploadedPhotos(payload);

  // Uploads finish one by one; each adds to the gallery as it is by then.
  const latest = useRef<MediaPayload>(payload);
  useEffect(() => {
    latest.current = payload;
  }, [payload]);
  const uploads = useGalleryUploads({
    deckId,
    onUploaded: (asset: MediaAsset) => {
      const next = withPhotos(latest.current, [photoOf(asset)]);
      latest.current = next;
      onChange(next);
    },
    ...uploadDeps,
  });

  useEffect(() => onBusyChange(uploads.busy), [onBusyChange, uploads.busy]);

  const room = MEDIA_GALLERY_MAX - photos.length - uploads.pending.length;
  const pickDisabled = disabled || !online;

  const pick = (...files: File[]) => {
    const accepted: File[] = [];
    let refused: string | null = null;
    for (const file of files) {
      const reason =
        kindOfFile(file) === 'image'
          ? checkMediaFile(file, limits)
          : 'Choose a JPEG, PNG, WebP or HEIC photo.';
      if (reason) refused ??= reason;
      else accepted.push(file);
    }
    const added = accepted.slice(0, Math.max(0, room));
    const left = accepted.length - added.length;
    const over =
      left > 0
        ? `A card holds at most ${MEDIA_GALLERY_MAX} photos; ${left === 1 ? '1 photo was' : `${left} photos were`} not added.`
        : null;
    setNotice(refused ?? over);
    if (added.length > 0) uploads.add(added);
  };

  usePasteImage(pick, !pickDisabled && room > 0);

  const empty = photos.length === 0 && uploads.pending.length === 0;
  const many = photos.length > 1;
  const required = errors['payload.images.0.publicId'] ?? errors['payload.images'];

  return (
    <div className="editor__fields image-fields gallery-fields">
      {photos.length > 0 && (
        <ol className="gallery-fields__list" aria-label="Photos">
          {photos.map((photo, index) => {
            const name = many ? `photo ${index + 1}` : 'photo';
            return (
              <li key={photo.publicId} className="gallery-fields__item">
                <div className="gallery-fields__thumb">
                  <ImageCard payload={photo} alt="" cloudName={cloudName} />
                </div>
                <div className="gallery-fields__detail">
                  <TextInput
                    label={
                      many
                        ? `Description of photo ${index + 1} (optional)`
                        : 'Description (optional)'
                    }
                    value={photo.alt ?? ''}
                    onChange={(alt) => onChange(describePhoto(payload, index, alt))}
                    error={errors[`payload.images.${index}.alt`]}
                    disabled={disabled}
                    hint={index === 0 ? IMAGE_DESCRIPTION_HINT : undefined}
                  />
                  <div className="gallery-fields__actions">
                    {many && (
                      <>
                        <IconButton
                          icon="arrow-up"
                          label={`Move ${name} earlier`}
                          disabledReason={index === 0 ? 'Already the first photo' : null}
                          onClick={() => onChange(movePhoto(payload, index, -1))}
                        />
                        <IconButton
                          icon="arrow-down"
                          label={`Move ${name} later`}
                          disabledReason={
                            index === photos.length - 1 ? 'Already the last photo' : null
                          }
                          onClick={() => onChange(movePhoto(payload, index, 1))}
                        />
                      </>
                    )}
                    <IconButton
                      icon="trash"
                      label={`Remove ${name}`}
                      disabledReason={disabled ? 'Saving…' : null}
                      onClick={() => onChange(withoutPhotoAt(payload, index))}
                    />
                  </div>
                  {errors[`payload.images.${index}.publicId`] && (
                    <p className="field__error">{errors[`payload.images.${index}.publicId`]}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {uploads.pending.length > 0 && (
        <ul className="gallery-fields__list" aria-label="Uploading photos">
          {uploads.pending.map((entry) => (
            <li key={entry.id} className="gallery-fields__item">
              <div className="gallery-fields__thumb">
                <img className="image-fields__thumb" src={entry.localUrl} alt="" />
              </div>
              {entry.status === 'failed' ? (
                <div className="image-fields__failed" role="alert">
                  <p className="field__error">{entry.message}</p>
                  {entry.canRetry && (
                    <Button
                      icon="refresh"
                      label="Retry upload"
                      onClick={() => uploads.retry(entry.id)}
                      disabled={pickDisabled}
                    />
                  )}
                  <Button
                    icon="trash"
                    label="Remove"
                    variant="ghost"
                    onClick={() => uploads.remove(entry.id)}
                  />
                </div>
              ) : (
                <div className="image-fields__progress" role="status">
                  <progress
                    max={100}
                    value={entry.status === 'uploading' ? (entry.percent ?? undefined) : undefined}
                    aria-label="Upload progress"
                  />
                  <span>{progressLabel(entry)}</span>
                  <Button
                    icon="close"
                    label="Cancel upload"
                    variant="ghost"
                    onClick={() => uploads.remove(entry.id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {room > 0 && (
        <div className="image-fields__pick">
          <PickButton label="Take photo" capture disabled={pickDisabled} onPick={pick} />
          <PickButton
            label={photos.length > 0 ? 'Add photos' : 'Choose photos'}
            multiple
            disabled={pickDisabled}
            onPick={pick}
          />
          {empty && onPickFile && (
            <PickButton
              label="Choose file"
              icon="file"
              accept={FILE_ACCEPT}
              disabled={pickDisabled}
              onPick={onPickFile}
            />
          )}
          {!pickDisabled && <p className="muted">Or paste a photo.</p>}
        </div>
      )}
      {photos.length > 0 && (
        <p className="muted gallery-fields__count">
          {photos.length} of {MEDIA_GALLERY_MAX} photos
        </p>
      )}

      {!online && <p className="muted">Photos and files can be added once you are back online.</p>}
      {notice && (
        <p className="field__error" role="alert">
          {notice}
        </p>
      )}
      {!notice && empty && required && <p className="field__error">{required}</p>}
    </div>
  );
}
