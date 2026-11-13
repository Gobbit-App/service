import type { ChangeEvent, ReactElement } from 'react';
import { IMAGE_ACCEPT } from '../image-file';
import { Icon, type IconName } from '../../ui/icons/Icon';

/** A file input styled as a button; `capture` opens the camera on phones. */
export function PickButton({
  label,
  capture,
  disabled,
  onPick,
  accept = IMAGE_ACCEPT,
  multiple = false,
  icon,
}: {
  label: string;
  capture?: boolean;
  disabled: boolean;
  /** Every picked file, in the order the device gave them (one unless `multiple`). */
  onPick: (file: File, ...more: File[]) => void;
  /** 045: what the picker offers (photos by default). */
  accept?: string;
  /** D398: pick several photos at once. */
  multiple?: boolean;
  icon?: IconName;
}): ReactElement {
  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    const [first, ...more] = files;
    if (first) onPick(first, ...more);
  };
  return (
    <label className="button button--ghost button--icon image-fields__picker">
      <input
        type="file"
        className="visually-hidden"
        accept={accept}
        multiple={multiple}
        capture={capture ? 'environment' : undefined}
        disabled={disabled}
        onChange={onInput}
      />
      <Icon name={icon ?? (capture ? 'photo' : 'upload')} />
      <span className="button__label">{label}</span>
    </label>
  );
}
