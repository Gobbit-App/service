import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { CardCover } from '@gobbit/shared/card-cover';
import { useOnline } from '../../api/offline';
import { CoverBar } from '../../cards/CoverBar';
import { Button } from '../../ui/buttons/Button';
import { checkImageFile } from '../image-file';
import { useDropImage } from '../use-drop-image';
import { useImageUpload, type UseImageUploadOptions } from '../use-image-upload';
import { usePasteImage } from '../use-paste-image';
import { PickButton } from './PickButton';

export type CoverFieldProps = {
  cover: CardCover | null | undefined;
  onChange: (cover: CardCover | null) => void;
  deckId: string;
  disabled: boolean;
  /** Takes pastes only from inside the field (events, where the link photo takes the rest). */
  scoped?: boolean;
  /** Tests inject a fake signer/uploader. */
  uploadDeps?: Pick<UseImageUploadOptions, 'signer' | 'upload' | 'confirm'>;
};

/**
 * 044 (D392): the optional cover image of a text or event card. Same signed upload, limits and
 * error copy as the photo fields; a failed upload leaves the previous cover as it was.
 */
export function CoverField({
  cover,
  onChange,
  deckId,
  disabled,
  scoped = false,
  uploadDeps,
}: CoverFieldProps): ReactElement {
  const online = useOnline();
  const rootRef = useRef<HTMLDivElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // The upload lands later; report it through the handler as it is then.
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  const upload = useImageUpload({
    deckId,
    onUploaded: (asset) =>
      latest.current({
        publicId: asset.publicId,
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
      }),
    ...uploadDeps,
  });

  const pickDisabled = disabled || !online;
  const pick = (file: File) => {
    if (pickDisabled) return;
    const refused = checkImageFile(file);
    setFileError(refused);
    if (refused) return;
    upload.start(file);
  };

  const { dragging } = useDropImage(rootRef, pick);
  usePasteImage(pick, !pickDisabled && !upload.busy, scoped ? rootRef : undefined);

  const remove = () => {
    upload.reset();
    setFileError(null);
    onChange(null);
  };

  const { state } = upload;
  return (
    <div ref={rootRef} className="cover-field" data-dragging={dragging ? '' : undefined}>
      {cover && (
        <div className="cover-field__preview">
          <CoverBar cover={cover} />
        </div>
      )}

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
            label={cover ? 'Replace image' : 'Add image'}
            disabled={pickDisabled}
            onPick={pick}
          />
          {cover && (
            <Button
              icon="trash"
              label="Remove image"
              variant="ghost"
              onClick={remove}
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
