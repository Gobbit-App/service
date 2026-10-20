import type { ReactElement } from 'react';
import { CARD_BODY_MAX, codePointLength } from '@pb/shared/card-limits';
import { LimitMeter } from './LimitMeter';
import { TextInput } from './TextInput';

/** Markdown body; the 600 limit counts Unicode code points like the DB CHECK. */
export function BodyField({
  value,
  onChange,
  error,
  disabled,
  label = 'Body',
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
}): ReactElement {
  return (
    <TextInput
      label={label}
      value={value}
      onChange={onChange}
      error={error}
      disabled={disabled}
      multiline
      rows={6}
      hint={<LimitMeter used={codePointLength(value)} max={CARD_BODY_MAX} />}
    />
  );
}
