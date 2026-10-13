import { highlightSegments } from '@pb/shared/search';
import type { ReactElement } from 'react';

/** Renders `text` with case/diacritic-insensitive query hits wrapped in <mark>. */
export function Highlighted({ text, query }: { text: string; query: string }): ReactElement {
  const segments = highlightSegments(text, query);
  return (
    <>
      {segments.map((segment, i) =>
        segment.hit ? (
          <mark key={i} className="search-hit-mark">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}
