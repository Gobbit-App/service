import type { ReactElement } from 'react';
import { CARD_TITLE_MAX, codePointLength } from '@pb/shared/card-limits';
import { LimitMeter } from './LimitMeter';
import { TextInput } from './TextInput';

export function TitleField({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}): ReactElement {
  return (
    <TextInput
      label="Title"
      value={value}
      onChange={onChange}
      error={error}
      disabled={disabled}
      hint={<LimitMeter used={codePointLength(value.trim())} max={CARD_TITLE_MAX} />}
    />
  );
}
