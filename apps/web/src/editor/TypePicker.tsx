import { useId, type ReactElement } from 'react';
import type { ItemType } from '@gobbit/shared';
import { useCloudName } from '../cards/use-cloud-name';
import { CREATABLE_TYPES, type CreatableType } from './draft';

export const IMAGES_UNAVAILABLE = "Image cards aren't available: image storage isn't set up here.";

export const TYPE_LABELS: Record<ItemType, string> = {
  text: 'Text',
  link: 'Link',
  image: 'Image',
  table: 'Table',
  calc: 'Calc',
};

/** Create only: a radio group of the creatable types (D135); image needs a cloud name (FR-015). */
export function TypePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ItemType;
  onChange: (type: CreatableType) => void;
  disabled?: boolean;
}): ReactElement {
  const name = useId();
  const noteId = useId();
  const imagesOff = useCloudName() === null;
  return (
    <fieldset className="editor__types">
      <legend>Type</legend>
      {CREATABLE_TYPES.map((type) => {
        const unavailable = type === 'image' && imagesOff;
        return (
          <label key={type} className="card-editor__choice">
            <input
              type="radio"
              name={name}
              value={type}
              checked={value === type}
              disabled={disabled || (unavailable && value !== type)}
              aria-describedby={unavailable ? noteId : undefined}
              onChange={() => onChange(type)}
            />
            {TYPE_LABELS[type]}
          </label>
        );
      })}
      {imagesOff && (
        <p id={noteId} className="muted editor__types-note">
          {IMAGES_UNAVAILABLE}
        </p>
      )}
    </fieldset>
  );
}
