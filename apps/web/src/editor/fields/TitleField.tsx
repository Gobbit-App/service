import type { ReactElement, Ref } from 'react';
import { CARD_TITLE_MAX, codePointLength } from '@gobbit/shared/card-limits';
import { LimitMeter } from './LimitMeter';
import { TextInput } from './TextInput';

export function TitleField({
  value,
  onChange,
  error,
  disabled,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}): ReactElement {
  return (
    <TextInput
      label="Title"
      value={value}
      onChange={onChange}
      error={error}
      disabled={disabled}
      inputRef={inputRef}
      hint={<LimitMeter used={codePointLength(value.trim())} max={CARD_TITLE_MAX} />}
    />
  );
}
