import { useId, type ReactElement } from 'react';
import type { Category, Deck } from '@pb/shared';

export type CategoryChipsProps = {
  deck: Deck;
  /** Only the categories the user can see (D38). */
  categories: readonly Category[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  /** Shown under the chips (e.g. "Pick at least one category"). */
  error?: string;
  disabled?: boolean;
};

/** Multi-select category chips (toggle buttons); a card needs at least one. */
export function CategoryChips({
  categories,
  selected,
  onChange,
  error,
  disabled = false,
}: CategoryChipsProps): ReactElement {
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;

  const toggle = (categoryId: string) =>
    onChange(
      selected.includes(categoryId)
        ? selected.filter((existing) => existing !== categoryId)
        : [...selected, categoryId],
    );

  return (
    <div
      className="field category-chips"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={error ? errorId : undefined}
    >
      <span id={labelId} className="field__label">
        Categories
      </span>
      <ul className="category-chips__list">
        {categories.map((category) => {
          const on = selected.includes(category.id);
          return (
            <li key={category.id}>
              <button
                type="button"
                className="chip"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(category.id)}
              >
                {category.name}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
