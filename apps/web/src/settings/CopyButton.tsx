import { useState, type ReactElement } from 'react';

type Clipboard = { writeText: (text: string) => Promise<void> };

/** Copies `value`; says "Copied" on success and "Copy failed" when the clipboard is unavailable. */
export function CopyButton({
  value,
  label,
  clipboard = globalThis.navigator?.clipboard,
}: {
  value: string;
  label: string;
  clipboard?: Clipboard;
}): ReactElement {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    try {
      if (!clipboard) throw new Error('Clipboard unavailable');
      await clipboard.writeText(value);
      setState('copied');
    } catch (err) {
      console.warn('[settings] copy failed', err);
      setState('failed');
    }
  };

  return (
    <button
      type="button"
      className="button button--ghost"
      aria-label={label}
      onClick={() => void handleCopy()}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  );
}
