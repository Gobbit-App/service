import { useId, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { readRecentSearches } from '../search/recent-searches';
import { RecentSearches } from '../search/RecentSearches';
import { Sheet } from '../ui/sheet/Sheet';

/**
 * D382: deck search opens in a sheet (from the bottom on phones): the search box, focused, and the
 * deck's recent searches when there are any. Enter or a picked recent search runs the search.
 */
export function SearchSheet({
  deckSlug,
  initialQuery,
  onSearch,
  onClose,
}: {
  deckSlug: string;
  /** The query on screen (search results), so it can be refined; '' elsewhere. */
  initialQuery: string;
  /** Called with a non-blank, trimmed query. */
  onSearch: (q: string) => void;
  onClose: () => void;
}): ReactElement {
  const titleId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialQuery);
  // Read once per opening: the list only changes when a search runs, which closes the sheet.
  const [recent] = useState(() => readRecentSearches(deckSlug));

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const q = value.trim();
    if (q) onSearch(q);
  };

  return (
    <Sheet labelledBy={titleId} onClose={onClose} initialFocus={input} className="search-sheet">
      <h2 id={titleId} className="sheet__title">
        Search
      </h2>
      <form role="search" className="search-box" onSubmit={submit}>
        <input
          ref={input}
          type="search"
          className="search-box__input"
          aria-label="Search this deck"
          placeholder="Search cards…"
          enterKeyHint="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </form>
      <RecentSearches items={recent} onPick={onSearch} />
    </Sheet>
  );
}
