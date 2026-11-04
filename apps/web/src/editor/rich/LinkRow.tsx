import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { normalizeUrlInput } from '../../lib/url-input';
import { Button } from '../../ui/buttons/Button';
import { useUrlInput } from '../../ui/use-url-input';

/**
 * D290: the link panel. A URL input (D205 rules) with Apply, and Remove when the selection is
 * already a link. Enter applies, Escape closes. No nested `<form>`: the editor already sits in one.
 */
export function LinkRow({
  href,
  onApply,
  onRemove,
  onClose,
}: {
  /** The current link's address, or null when the selection has none. */
  href: string | null;
  onApply: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}): ReactElement {
  const id = useId();
  const [value, setValue] = useState(href ?? '');
  const input = useRef<HTMLInputElement>(null);
  const url = useUrlInput(value, setValue);
  const normalized = normalizeUrlInput(value);

  useEffect(() => input.current?.focus(), []);

  const apply = () => {
    if (normalized) onApply(normalized);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="rich-editor__panel rich-editor__link"
      role="group"
      aria-label="Link"
      onKeyDown={onKeyDown}
    >
      <label htmlFor={id} className="visually-hidden">
        Link address
      </label>
      <input
        ref={input}
        id={id}
        type="url"
        inputMode="url"
        dir="ltr"
        placeholder="https://"
        value={value}
        {...url}
      />
      <Button
        icon="check"
        label="Apply"
        disabledReason={normalized ? null : 'Enter an address'}
        onClick={apply}
      />
      {href !== null && (
        <Button icon="close" label="Remove link" variant="ghost" onClick={onRemove} />
      )}
    </div>
  );
}
