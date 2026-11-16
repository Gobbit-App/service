import { useRef, useState, type ReactElement } from 'react';
import type { CardCover } from '@gobbit/shared/card-cover';
import { useOnline } from '../../api/offline';
import { CoverBar } from '../../cards/CoverBar';
import { useCloudName } from '../../cards/use-cloud-name';
import { Button } from '../../ui/buttons/Button';
import { checkImageFile } from '../image-file';
import { useDropImage } from '../use-drop-image';
import { useImageUpload, type UseImageUploadOptions } from '../use-image-upload';
import { usePasteImage } from '../use-paste-image';
import { PickButton } from './PickButton';

export type CoverFieldProps = {
  deckId: string;
  cover: CardCover | null | undefined;
  onChange: (cover: CardCover | null) => void;
  disabled?: boolean;
  /** Tests inject a fake signer/uploader. */
  uploadDeps?: Pick<UseImageUploadOptions, 'signer' | 'upload' | 'confirm'>;
};

/**
 * D412: the card cover. Same signed upload and limits as photo uploads; a failed upload keeps the
 * previous cover. Paste is scoped to this field so it never competes with other paste targets.
 */
export function CoverField({
  deckId,
  cover,
  onChange,
  disabled = false,
  uploadDeps,
}: CoverFieldProps): ReactElement {
  const online = useOnline();
  const cloudName = useCloudName();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const upload = useImageUpload({
    deckId,
    onUploaded: (asset) =>
      onChange({
        publicId: asset.publicId,
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
      }),
    ...uploadDeps,
  });

  const pickDisabled = disabled || !online;
  const pick = (file: File) => {
    if (pickDisabled || upload.busy) return;
    const refused = checkImageFile(file);
    setFileError(refused);
    if (!refused) upload.start(file);
  };
  useDropImage(rootRef, pick);
  usePasteImage(pick, !pickDisabled && !upload.busy, root);

  const { state } = upload;
  return (
    <div
      className="cover-field"
      ref={(el) => {
        rootRef.current = el;
        setRoot(el);
      }}
    >
      <CoverBar cover={cover} cloudName={cloudName} loading="eager" />

      {upload.busy ? (
        <div className="image-fields__progress" role="status">
          <span>
            {state.status === 'uploading' ? `Uploading… ${state.percent}%` : 'Adding image…'}
          </span>
          <Button icon="close" label="Cancel upload" variant="ghost" onClick={upload.cancel} />
        </div>
      ) : (
        <div className="image-fields__pick">
          <PickButton
            label={cover ? 'Replace cover image' : 'Add cover image'}
            disabled={pickDisabled}
            onPick={pick}
          />
          {cover && (
            <Button
              icon="trash"
              label="Remove cover image"
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
      {fileError && (
        <p className="field__error" role="alert">
          {fileError}
        </p>
      )}
    </div>
  );
}
