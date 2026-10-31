import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { SEARCH_DEBOUNCE_MS } from '@gobbit/shared/search';
import { useDebounced } from './use-debounced';

/** Search input that emits trimmed queries, debounced while typing and immediately on submit. */
export function SearchBox({
  initialQuery = '',
  onSearch,
  autoFocus = false,
}: {
  initialQuery?: string;
  onSearch: (q: string) => void;
  autoFocus?: boolean;
}): ReactElement {
  const [value, setValue] = useState(initialQuery);
  const debounced = useDebounced(value, SEARCH_DEBOUNCE_MS);
  const lastEmitted = useRef(initialQuery.trim());

  // Follow outside changes (a picked recent search, back/forward) without echoing them back.
  useEffect(() => {
    const trimmed = initialQuery.trim();
    if (trimmed !== lastEmitted.current) {
      lastEmitted.current = trimmed;
      setValue(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    const trimmed = debounced.trim();
    if (trimmed !== lastEmitted.current) {
      lastEmitted.current = trimmed;
      onSearch(trimmed);
    }
  }, [debounced, onSearch]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = value.trim();
    lastEmitted.current = trimmed;
    onSearch(trimmed);
  };

  return (
    <form role="search" className="search-box" onSubmit={handleSubmit}>
      <input
        type="search"
        className="search-box__input"
        aria-label="Search this deck"
        placeholder="Search cards…"
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </form>
  );
}
