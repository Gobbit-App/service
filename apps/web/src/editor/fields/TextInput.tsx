import { useId, type ReactElement, type ReactNode } from 'react';
import { useUrlInput } from '../../ui/use-url-input';

/**
 * A labelled input or textarea with its error linked through `aria-describedby` and
 * `aria-invalid` (D136). The base for every text field in the editor. `type="url"` follows the
 * shared URL-input rule (D205): `https://` on focus, normalised on blur.
 */
export function TextInput({
  label,
  value,
  onChange,
  error,
  multiline = false,
  type = 'text',
  disabled = false,
  hint,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  multiline?: boolean;
  type?: 'text' | 'url';
  disabled?: boolean;
  /** Shown under the input (e.g. a `LimitMeter`) and linked as a description. */
  hint?: ReactNode;
  rows?: number;
}): ReactElement {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const url = useUrlInput(value, onChange);
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  const common = {
    id,
    value,
    disabled,
    dir: 'auto',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  } as const;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(e) => onChange(e.currentTarget.value)} />
      ) : type === 'url' ? (
        <input {...common} type="url" inputMode="url" {...url} />
      ) : (
        <input {...common} type="text" onChange={(e) => onChange(e.currentTarget.value)} />
      )}
      {hint && (
        <div id={hintId} className="field__hint">
          {hint}
        </div>
      )}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
