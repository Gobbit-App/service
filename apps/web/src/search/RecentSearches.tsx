import type { ReactElement } from 'react';

/** Recent search chips; renders nothing when the list is empty. */
export function RecentSearches({
  items,
  onPick,
}: {
  items: readonly string[];
  onPick: (q: string) => void;
}): ReactElement | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="recent-searches" aria-label="Recent searches">
      <h2 className="recent-searches__title">Recent searches</h2>
      <ul>
        {items.map((q) => (
          <li key={q}>
            <button type="button" className="recent-searches__item" onClick={() => onPick(q)}>
              {q}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
