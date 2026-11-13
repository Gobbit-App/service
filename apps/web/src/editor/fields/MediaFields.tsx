import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { MediaPayload } from '../../cards/payload-guards';
import { useOnline } from '../../api/offline';
import { checkMediaFile, kindOfFile } from '../media-file';
import { emptyMedia, fileOf } from '../media-payload';
import { useImageUpload, type UseImageUploadOptions } from '../use-image-upload';
import { useMediaLimits } from '../use-media-limits';
import { FileFields } from './FileFields';
import { GalleryFields } from './GalleryFields';
import type { FieldsProps } from './types';

export type MediaFieldsProps = FieldsProps<'media'> & {
  /** Tests inject a fake signer/uploader. */
  uploadDeps?: Pick<UseImageUploadOptions, 'signer' | 'upload' | 'confirm'>;
};

/**
 * 045 (D386, D398): a media card's editor (was ImageFields). Photos make a gallery of up to 8;
 * with nothing added yet, one PDF, audio or video file can be chosen instead. Every file is
 * checked against its kind's limit before any upload (FR-008) and Save waits for uploads.
 */
export function MediaFields({
  payload,
  onChange,
  errors,
  deck,
  disabled,
  onUploadingChange,
  uploadDeps,
}: MediaFieldsProps): ReactElement {
  const online = useOnline();
  const limits = useMediaLimits();
  const [fileError, setFileError] = useState<string | null>(null);
  const [galleryBusy, setGalleryBusy] = useState(false);

  const file = payload.kind === 'image' ? null : payload;
  const upload = useImageUpload({
    deckId: deck.id,
    onUploaded: (asset) => {
      const next = fileOf(asset, file?.alt ?? '');
      if (next) onChange(next);
    },
    ...uploadDeps,
  });

  const busy = galleryBusy || upload.busy;
  useEffect(() => {
    onUploadingChange?.(busy);
  }, [busy, onUploadingChange]);
  useEffect(() => () => onUploadingChange?.(false), [onUploadingChange]);

  const pickFile = (picked: File) => {
    const refused = checkMediaFile(picked, limits);
    const kind = kindOfFile(picked);
    setFileError(refused ?? (kind === 'image' ? 'Choose a PDF, audio or video file.' : null));
    if (refused || !kind || kind === 'image') return;
    upload.start(picked, kind);
  };

  const onGalleryBusy = useCallback((next: boolean) => setGalleryBusy(next), []);

  const notice = fileError && (
    <p className="field__error" role="alert">
      {fileError}
    </p>
  );

  if (file || upload.state.status !== 'idle') {
    return (
      <>
        <FileFields
          file={file}
          state={upload.state}
          busy={upload.busy}
          errors={errors}
          disabled={disabled}
          online={online}
          onDescribe={(alt) => file && onChange({ ...file, alt } satisfies MediaPayload)}
          onPick={pickFile}
          onCancel={upload.cancel}
          onRetry={upload.retry}
          onRemove={() => {
            upload.reset();
            setFileError(null);
            onChange(emptyMedia());
          }}
        />
        {notice}
      </>
    );
  }

  return (
    <>
      <GalleryFields
        payload={payload.kind === 'image' ? payload : emptyMedia()}
        onChange={onChange}
        errors={errors}
        deckId={deck.id}
        disabled={disabled}
        online={online}
        onBusyChange={onGalleryBusy}
        onPickFile={pickFile}
        uploadDeps={uploadDeps}
      />
      {notice}
    </>
  );
}
