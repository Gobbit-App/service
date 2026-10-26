import type { ChangeEvent, FocusEvent } from 'react';
import { URL_PREFIX, collapseDoubledScheme, normalizeUrlInput } from '../lib/url-input';

type UrlInputHandlers = {
  onFocus: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

function caretToEnd(input: HTMLInputElement): void {
  requestAnimationFrame(() => {
    try {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    } catch {
      // Some input types refuse selection APIs; the caret position is only a nicety.
    }
  });
}

/**
 * D205: `https://` on focus when empty (caret at the end), normalised on blur, and a full address
 * pasted over the prefill collapsed to one scheme. Shared by every URL input.
 */
export function useUrlInput(value: string, onChange: (value: string) => void): UrlInputHandlers {
  return {
    onFocus: (event) => {
      if (value.trim() !== '') return;
      onChange(URL_PREFIX);
      caretToEnd(event.currentTarget);
    },
    onBlur: () => {
      const next = normalizeUrlInput(value);
      if (next !== value) onChange(next);
    },
    onChange: (event) => onChange(collapseDoubledScheme(event.currentTarget.value)),
  };
}
