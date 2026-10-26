import { useEffect, useState, type ReactElement } from 'react';
import { ImageCard } from '../../cards/ImageCard';
import { useCloudName } from '../../cards/use-cloud-name';
import { useOnline } from '../../api/offline';
import { checkImageFile } from '../image-file';
import { withoutPhoto, withPhoto } from '../image-payload';
import { useImageUpload, type UseImageUploadOptions } from '../use-image-upload';
import { PickButton } from './PickButton';
import { TextInput } from './TextInput';
import type { FieldsProps } from './types';
import { Button } from '../../ui/buttons/Button';

export type ImageFieldsProps = FieldsProps<'image'> & {
  /** Tests inject a fake signer/uploader. */
  uploadDeps?: Pick<UseImageUploadOptions, 'signer' | 'upload' | 'confirm'>;
};

/**
 * D133: take or pick a photo, upload it straight to Cloudinary with a signed permission, and
 * add alt text. A cancelled or failed upload leaves no photo on the draft (FR-005).
 */
/** D206: who the optional description helps, and what happens without it. */
export const IMAGE_DESCRIPTION_HINT =
  'Helps people who use a screen reader. Leave empty to use the card title.';

export function ImageFields({
  payload,
  onChange,
  errors,
  deck,
  disabled,
  uploadDeps,
}: ImageFieldsProps): ReactElement {
  const cloudName = useCloudName();
  const online = useOnline();
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const upload = useImageUpload({
    deckId: deck.id,
    onUploaded: (asset) => onChange(withPhoto(payload, asset)),
    ...uploadDeps,
  });

  useEffect(
    () => () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    },
    [localUrl],
  );

  const pick = (file: File) => {
    const refused = checkImageFile(file);
    setFileError(refused);
    if (refused) return;
    setLocalUrl(URL.createObjectURL(file));
    if (payload.publicId !== '') onChange(withoutPhoto(payload));
    upload.start(file);
  };

  const cancel = () => {
    upload.cancel();
    setLocalUrl(null);
  };

  const remove = () => {
    upload.reset();
    setLocalUrl(null);
    setFileError(null);
    onChange(withoutPhoto(payload));
  };

  const { state } = upload;
  const hasPhoto = payload.publicId !== '';
  const showPickers = !upload.busy && !hasPhoto;
  const pickDisabled = disabled || !online;

  return (
    <div className="editor__fields image-fields">
      {(localUrl || hasPhoto) && (
        <div className="image-fields__photo">
          {localUrl ? (
            <img className="image-fields__thumb" src={localUrl} alt="" />
          ) : (
            <ImageCard payload={payload} alt={payload.alt?.trim() ?? ''} cloudName={cloudName} />
          )}
        </div>
      )}

      {upload.busy && (
        <div className="image-fields__progress" role="status">
          <progress
            max={100}
            value={state.status === 'uploading' ? state.percent : undefined}
            aria-label="Upload progress"
          />
          <span>
            {state.status === 'uploading'
              ? `Uploading… ${state.percent}%`
              : state.status === 'confirming'
                ? 'Saving photo…'
                : 'Preparing upload…'}
          </span>
          <Button icon="close" label="Cancel upload" variant="ghost" onClick={cancel} />
        </div>
      )}

      {state.status === 'failed' && (
        <div className="image-fields__failed" role="alert">
          <p className="field__error">{state.message}</p>
          {state.canRetry && (
            <Button
              icon="refresh"
              label="Retry upload"
              onClick={upload.retry}
              disabled={pickDisabled}
            />
          )}
        </div>
      )}

      {showPickers && (
        <div className="image-fields__pick">
          <PickButton label="Take photo" capture disabled={pickDisabled} onPick={pick} />
          <PickButton label="Choose photo" disabled={pickDisabled} onPick={pick} />
        </div>
      )}

      {hasPhoto && !upload.busy && (
        <div className="image-fields__pick">
          <PickButton label="Replace photo" disabled={pickDisabled} onPick={pick} />
          <Button
            icon="trash"
            label="Remove photo"
            variant="ghost"
            onClick={remove}
            disabled={disabled}
          />
        </div>
      )}

      {!online && <p className="muted">Photos can be added once you are back online.</p>}
      {fileError && (
        <p className="field__error" role="alert">
          {fileError}
        </p>
      )}
      {!fileError && errors['payload.publicId'] && !upload.busy && state.status !== 'failed' && (
        <p className="field__error">{errors['payload.publicId']}</p>
      )}

      <TextInput
        label="Description (optional)"
        value={payload.alt ?? ''}
        onChange={(alt) => onChange({ ...payload, alt })}
        error={errors['payload.alt']}
        disabled={disabled}
        hint={IMAGE_DESCRIPTION_HINT}
      />
    </div>
  );
}
