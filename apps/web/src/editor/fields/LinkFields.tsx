import type { ReactElement, ReactNode } from 'react';
import { normalizeUrlInput } from '../../lib/url-input';
import type { LinkDraftPayload } from '../draft';
import { TextInput } from './TextInput';
import type { FieldsProps } from './types';

export type LinkPreview = NonNullable<LinkDraftPayload['preview']>;

export type LinkPreviewSlotContext = {
  url: string;
  /** The preview as it is now, member edits included. */
  preview: LinkPreview;
  setPreview: (preview: LinkPreview) => void;
  setTitleIfEmpty: (title: string) => void;
};

export type LinkFieldsProps = FieldsProps<'link'> & {
  /** 008 seam: Fetch preview renders here with the current URL. */
  previewSlot?: (ctx: LinkPreviewSlotContext) => ReactNode;
};

/** URL plus the editable preview text; `preview.image` and unknown keys are kept as-is. */
export function LinkFields({
  payload,
  onChange,
  errors,
  disabled,
  setTitleIfEmpty,
  previewSlot,
}: LinkFieldsProps): ReactElement {
  const preview = payload.preview ?? {};
  const setPreview = (next: LinkPreview) => onChange({ ...payload, preview: next });
  const editPreview = (key: 'title' | 'description', value: string) =>
    setPreview({ ...preview, [key]: value });

  return (
    <div className="editor__fields">
      <TextInput
        label="URL"
        type="url"
        value={payload.url}
        onChange={(url) => onChange({ ...payload, url })}
        error={errors['payload.url']}
        disabled={disabled}
      />
      {previewSlot?.({
        url: normalizeUrlInput(payload.url),
        preview,
        setPreview,
        setTitleIfEmpty: setTitleIfEmpty ?? (() => undefined),
      })}
      <TextInput
        label="Preview title"
        value={preview.title ?? ''}
        onChange={(value) => editPreview('title', value)}
        error={errors['payload.preview.title']}
        disabled={disabled}
      />
      <TextInput
        label="Preview description"
        value={preview.description ?? ''}
        onChange={(value) => editPreview('description', value)}
        error={errors['payload.preview.description']}
        disabled={disabled}
        multiline
        rows={2}
      />
      {errors['payload.preview.image'] && (
        <p className="field__error">{errors['payload.preview.image']}</p>
      )}
    </div>
  );
}
