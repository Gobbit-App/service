import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useOnline } from '../../api/offline';
import { checkImageFile } from '../image-file';
import { useImageUpload, type UseImageUploadOptions } from '../use-image-upload';
import type { LinkPreview, LinkPreviewSlotContext } from './LinkFields';
import { PickButton } from './PickButton';
import { Button } from '../../ui/buttons/Button';

export type LinkPhotoProps = LinkPreviewSlotContext & {
  deckId: string;
  disabled: boolean;
  /** Tests inject a fake signer/uploader. */
  uploadDeps?: Pick<UseImageUploadOptions, 'signer' | 'upload' | 'confirm'>;
};

/** "Remove photo": no picture at all, so the snapshot job has nothing to copy back (015). */
export function withoutLinkPhoto(preview: LinkPreview): LinkPreview {
  const { width: _w, height: _h, image: _i, ...rest } = preview;
  return { ...rest, publicId: null };
}

/**
 * 015 "Add photo" for a link card (D167): the member's own picture of what the link shows, for
 * pages the server can't read. Same signed upload as image cards (D133); the editor preview
 * shows the result.
 */
export function LinkPhoto({ deckId, disabled, uploadDeps, ...ctx }: LinkPhotoProps): ReactElement {
  const online = useOnline();
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // The upload lands later; apply it to the preview as it is then, not as it was at the pick.
  const latest = useRef(ctx);
  useEffect(() => {
    latest.current = ctx;
  });
  const upload = useImageUpload({
    deckId,
    onUploaded: (asset) => {
      const now = latest.current;
      now.setPreview({
        ...now.preview,
        publicId: asset.publicId,
        ...(asset.width ? { width: asset.width } : {}),
        ...(asset.height ? { height: asset.height } : {}),
      });
      setLocalUrl(null);
    },
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
    ctx.setPreview(withoutLinkPhoto(ctx.preview));
  };

  const { state } = upload;
  const hasPhoto = typeof ctx.preview.publicId === 'string' && ctx.preview.publicId !== '';
  const pickDisabled = disabled || !online;

  return (
    <div className="link-photo">
      {localUrl && upload.busy && <img className="link-photo__thumb" src={localUrl} alt="" />}

      {upload.busy ? (
        <div className="image-fields__progress" role="status">
          <span>
            {state.status === 'uploading' ? `Uploading… ${state.percent}%` : 'Adding photo…'}
          </span>
          <Button icon="close" label="Cancel upload" variant="ghost" onClick={cancel} />
        </div>
      ) : (
        <div className="image-fields__pick">
          <PickButton
            label={hasPhoto ? 'Replace photo' : 'Add photo'}
            disabled={pickDisabled}
            onPick={pick}
          />
          {hasPhoto && (
            <Button
              icon="trash"
              label="Remove photo"
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
