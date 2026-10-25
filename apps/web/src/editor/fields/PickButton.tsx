import type { ChangeEvent, ReactElement } from 'react';
import { IMAGE_ACCEPT } from '../image-file';
import { Icon } from '../../ui/icons/Icon';

/** A file input styled as a button; `capture` opens the camera on phones. */
export function PickButton({
  label,
  capture,
  disabled,
  onPick,
}: {
  label: string;
  capture?: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
}): ReactElement {
  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) onPick(file);
  };
  return (
    <label className="button button--ghost button--icon image-fields__picker">
      <input
        type="file"
        className="visually-hidden"
        accept={IMAGE_ACCEPT}
        capture={capture ? 'environment' : undefined}
        disabled={disabled}
        onChange={onInput}
      />
      <Icon name={capture ? 'photo' : 'upload'} />
      <span className="button__label">{label}</span>
    </label>
  );
}
