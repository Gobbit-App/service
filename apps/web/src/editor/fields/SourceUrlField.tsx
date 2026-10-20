import type { ReactElement } from 'react';
import { TextInput } from './TextInput';

/** Optional "where this came from" link; cleared → `sourceUrl: null` on PATCH. */
export function SourceUrlField({
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
      label="Source URL"
      type="url"
      value={value}
      onChange={onChange}
      error={error}
      disabled={disabled}
    />
  );
}
