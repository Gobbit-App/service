import { lazy, Suspense, useEffect, useRef, useState, type ReactElement } from 'react';
import { useOnline } from '../api/offline';
import { useCloudName } from '../cards/use-cloud-name';
import { checkImageFile } from '../editor/image-file';
import { PickButton } from '../editor/fields/PickButton';
import { useDropImage } from '../editor/use-drop-image';
import { useImageUpload, type UseImageUploadOptions } from '../editor/use-image-upload';
import { Avatar, type AvatarMember } from '../ui/Avatar';
import { Button } from '../ui/buttons/Button';

// The crop sheet is only needed once a photo is picked: keep it out of the main chunk.
const AvatarCropper = lazy(() => import('./AvatarCropper'));

export type ProfilePhoto = { publicId: string; width?: number; height?: number };

/** Selfie capture only where a phone's camera is likely; other devices get the file picker. */
const hasCamera = () =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices) &&
  typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches;

/**
 * 046 (Story 3): the profile photo. `CoverField`'s pick / drop / remove row; a pick opens the
 * cropper, the cropped square uploads to the member's own folder, and the form holds the new
 * `publicId` until Save. A failed upload keeps the previous photo.
 */
export function PhotoField({
  member,
  photo,
  onChange,
  disabled = false,
  onUploadingChange,
  uploadDeps,
}: {
  /** Preview identity; `photo` overrides `member.photo`. */
  member: Omit<AvatarMember, 'photo'>;
  photo: ProfilePhoto | null;
  onChange: (photo: ProfilePhoto | null) => void;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  /** Tests inject a fake signer/uploader. */
  uploadDeps?: Pick<UseImageUploadOptions, 'signer' | 'upload' | 'confirm'>;
}): ReactElement {
  const online = useOnline();
  const cloudName = useCloudName();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const upload = useImageUpload({
    target: { kind: 'profile' },
    onUploaded: (asset) =>
      onChange({
        publicId: asset.publicId,
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
      }),
    ...uploadDeps,
  });
  useEffect(() => {
    onUploadingChange?.(upload.busy);
  }, [upload.busy, onUploadingChange]);
  useEffect(() => () => onUploadingChange?.(false), [onUploadingChange]);

  const pickDisabled = disabled || !online;
  const pick = (file: File) => {
    if (pickDisabled || upload.busy) return;
    const refused = checkImageFile(file);
    setFileError(refused);
    if (!refused) setCropping(file);
  };
  useDropImage(rootRef, pick);

  const { state } = upload;
  return (
    <div className="field-group photo-field" ref={rootRef}>
      <div className="profile-preview">
        <Avatar size="md" member={{ ...member, photo }} ariaLabel="Your avatar, as others see it" />
        <p className="muted">How others see you</p>
      </div>

      {cloudName &&
        (upload.busy ? (
          <div className="image-fields__progress" role="status">
            <span>
              {state.status === 'uploading' ? `Uploading… ${state.percent}%` : 'Adding photo…'}
            </span>
            <Button icon="close" label="Cancel upload" variant="ghost" onClick={upload.cancel} />
          </div>
        ) : (
          <div className="image-fields__pick">
            <PickButton
              label={photo ? 'Replace photo' : 'Add photo'}
              disabled={pickDisabled}
              onPick={pick}
            />
            {hasCamera() && (
              <PickButton label="Take photo" capture="user" disabled={pickDisabled} onPick={pick} />
            )}
            {photo && (
              <Button
                icon="trash"
                label="Remove photo"
                variant="ghost"
                onClick={() => {
                  upload.reset();
                  setFileError(null);
                  onChange(null);
                }}
                disabled={disabled}
              />
            )}
          </div>
        ))}

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
      {fileError && (
        <p className="field__error" role="alert">
          {fileError}
        </p>
      )}

      {cropping && (
        <Suspense fallback={null}>
          <AvatarCropper
            file={cropping}
            onCancel={() => setCropping(null)}
            onError={(message) => {
              setCropping(null);
              setFileError(message);
            }}
            onConfirm={(blob) => {
              const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
              setCropping(null);
              setFileError(null);
              upload.start(file);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
