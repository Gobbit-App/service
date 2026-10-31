import type { ReactElement } from 'react';
import type { SearchWhy } from '@gobbit/shared';

/** Maps a search match reason to the short tag label shown on a result. */
export function resultTagLabel(why: SearchWhy): 'text' | 'meaning' {
  return why === 'semantic' ? 'meaning' : 'text';
}

const TITLES = {
  text: 'Matched the words',
  meaning: 'Matched the meaning',
} as const;

/** Small badge showing whether a result matched by words or by meaning. */
export function ResultTag({ why }: { why: SearchWhy }): ReactElement {
  const label = resultTagLabel(why);
  return (
    <span className={`result-tag result-tag--${label}`} title={TITLES[label]}>
      {label}
    </span>
  );
}
