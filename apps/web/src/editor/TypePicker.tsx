import { useId, type ReactElement } from 'react';
import type { ItemType } from '@pb/shared';
import { CREATABLE_TYPES, type CreatableType } from './draft';

export const TYPE_LABELS: Record<ItemType, string> = {
  text: 'Text',
  link: 'Link',
  image: 'Image',
  table: 'Table',
  calc: 'Calc',
};

/** Create only: a radio group of the creatable types (D135). */
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
  return (
    <fieldset className="editor__types">
      <legend>Type</legend>
      {CREATABLE_TYPES.map((type) => (
        <label key={type} className="card-editor__choice">
          <input
            type="radio"
            name={name}
            value={type}
            checked={value === type}
            disabled={disabled}
            onChange={() => onChange(type)}
          />
          {TYPE_LABELS[type]}
        </label>
      ))}
    </fieldset>
  );
}
