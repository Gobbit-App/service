import type { ReactElement } from 'react';
import type { SearchMode } from '@gobbit/shared/search';

const LABELS: Record<SearchMode, string> = { search: 'Search', ask: 'Ask' };

/** Search ↔ Ask switch on the search screen; only rendered when Ask is configured (D79). */
export function ModeToggle({
  mode,
  onChange,
}: {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}): ReactElement {
  return (
    <div className="mode-toggle" role="group" aria-label="Search mode">
      {(Object.keys(LABELS) as SearchMode[]).map((m) => (
        <button
          key={m}
          type="button"
          className="mode-toggle__option"
          aria-pressed={m === mode}
          onClick={() => {
            if (m !== mode) onChange(m);
          }}
        >
          {LABELS[m]}
        </button>
      ))}
    </div>
  );
}
