import { useEffect, useState, type ChangeEvent, type ReactElement } from 'react';
import { ImageCard } from '../../cards/ImageCard';
import { useCloudName } from '../../cards/use-cloud-name';
import { useOnline } from '../../api/offline';
import { checkImageFile, IMAGE_ACCEPT } from '../image-file';
import { withoutPhoto, withPhoto } from '../image-payload';
import { useImageUpload, type UseImageUploadOptions } from '../use-image-upload';
import { TextInput } from './TextInput';
import type { FieldsProps } from './types';

export type ImageFieldsProps = FieldsProps<'image'> & {
  /** Tests inject a fake signer/uploader. */
  uploadDeps?: Pick<UseImageUploadOptions, 'signer' | 'upload' | 'confirm'>;
};

/** A file input styled as a button; `capture` opens the camera on phones. */
function PickButton({
  label,
  capture,
  disabled,
  onPick,
}: {
  label: string;
  capture?: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
}): ReactElement {
  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) onPick(file);
  };
  return (
    <label className="button button--ghost image-fields__picker">
      <input
        type="file"
        className="visually-hidden"
        accept={IMAGE_ACCEPT}
        capture={capture ? 'environment' : undefined}
        disabled={disabled}
        onChange={onInput}
      />
      {label}
    </label>
  );
}

/**
 * D133: take or pick a photo, upload it straight to Cloudinary with a signed permission, and
 * add alt text. A cancelled or failed upload leaves no photo on the draft (FR-005).
 */
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
            <ImageCard payload={payload} cloudName={cloudName} />
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
          <button type="button" className="button button--ghost" onClick={cancel}>
            Cancel upload
          </button>
        </div>
      )}

      {state.status === 'failed' && (
        <div className="image-fields__failed" role="alert">
          <p className="field__error">{state.message}</p>
          {state.canRetry && (
            <button type="button" className="button" onClick={upload.retry} disabled={pickDisabled}>
              Retry upload
            </button>
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
          <button
            type="button"
            className="button button--ghost"
            onClick={remove}
            disabled={disabled}
          >
            Remove photo
          </button>
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
        label="Alt text"
        value={payload.alt}
        onChange={(alt) => onChange({ ...payload, alt })}
        error={errors['payload.alt']}
        disabled={disabled}
        hint="Describe the photo for people who can't see it."
      />
    </div>
  );
}
