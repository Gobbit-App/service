import type { ReactElement } from 'react';
import type { MediaFilePayload } from '../../cards/payload-guards';
import { formatDuration, pageCount } from '../../cards/media/format';
import { Button } from '../../ui/buttons/Button';
import { Icon } from '../../ui/icons/Icon';
import { FILE_ACCEPT } from '../media-file';
import type { ImageUploadState } from '../use-image-upload';
import type { FieldErrors } from '../validate';
import { PickButton } from './PickButton';
import { TextInput } from './TextInput';

const KIND_LABEL: Record<MediaFilePayload['kind'], string> = {
  pdf: 'PDF',
  audio: 'Audio',
  video: 'Video',
};

/** "PDF · 3 pages", "Video · 1:05": what the editor knows about the file so far. */
export function fileSummary(file: MediaFilePayload): string {
  const parts = [KIND_LABEL[file.kind]];
  if (file.kind === 'pdf' && file.pages) parts.push(pageCount(file.pages));
  if (file.kind !== 'pdf' && file.durationMs) parts.push(formatDuration(file.durationMs));
  return parts.join(' · ');
}

export type FileFieldsProps = {
  /** The card's file, or null while the first one uploads. */
  file: MediaFilePayload | null;
  state: ImageUploadState;
  busy: boolean;
  errors: FieldErrors;
  disabled: boolean;
  online: boolean;
  onDescribe: (alt: string) => void;
  onPick: (file: File) => void;
  onCancel: () => void;
  onRetry: () => void;
  /** Back to an empty media card (photos or another file). */
  onRemove: () => void;
};

/**
 * 045 (D386, D389): a PDF, audio or video card's one file: upload progress, retry, replace or
 * remove, and the description screen readers use. The page count, length and name shown come
 * from the stored file (FR-005).
 */
export function FileFields({
  file,
  state,
  busy,
  errors,
  disabled,
  online,
  onDescribe,
  onPick,
  onCancel,
  onRetry,
  onRemove,
}: FileFieldsProps): ReactElement {
  const pickDisabled = disabled || !online;
  return (
    <div className="editor__fields image-fields file-fields">
      {file && (
        <div className="file-fields__file">
          <Icon name={file.kind === 'pdf' ? 'file' : 'play'} />
          <div>
            {file.fileName && <p className="file-fields__name">{file.fileName}</p>}
            <p className="muted">{fileSummary(file)}</p>
          </div>
        </div>
      )}

      {busy && (
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
                ? 'Saving file…'
                : 'Preparing upload…'}
          </span>
          <Button icon="close" label="Cancel upload" variant="ghost" onClick={onCancel} />
        </div>
      )}

      {state.status === 'failed' && (
        <div className="image-fields__failed" role="alert">
          <p className="field__error">{state.message}</p>
          {state.canRetry && (
            <Button icon="refresh" label="Retry upload" onClick={onRetry} disabled={pickDisabled} />
          )}
        </div>
      )}

      {!busy && (
        <div className="image-fields__pick">
          <PickButton
            label={file ? 'Replace file' : 'Choose another file'}
            icon="file"
            accept={FILE_ACCEPT}
            disabled={pickDisabled}
            onPick={onPick}
          />
          <Button
            icon="trash"
            label={file ? 'Remove file' : 'Back'}
            variant="ghost"
            onClick={onRemove}
            disabled={disabled}
          />
        </div>
      )}

      {!online && <p className="muted">Files can be added once you are back online.</p>}
      {errors['payload.publicId'] && !busy && state.status !== 'failed' && (
        <p className="field__error">{errors['payload.publicId']}</p>
      )}

      {file && (
        <TextInput
          label="Description (optional)"
          value={file.alt ?? ''}
          onChange={onDescribe}
          error={errors['payload.alt']}
          disabled={disabled}
          hint="Helps people who use a screen reader. Leave empty to use the card title."
        />
      )}
    </div>
  );
}
