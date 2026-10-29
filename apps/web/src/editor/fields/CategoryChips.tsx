import { useId, type ReactElement } from 'react';
import type { Category, Deck } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import { NewCategory } from './NewCategory';

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

/**
 * Multi-select category chips (toggle buttons); a published card needs at least one. Members
 * who may create categories get "New category" inline (US6); the new one is selected.
 */
export function CategoryChips({
  deck,
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
        {can(deck.role, 'category.create') && (
          <li className="category-chips__new">
            <NewCategory
              deck={deck}
              disabled={disabled}
              onCreated={(category) => {
                if (!selected.includes(category.id)) onChange([...selected, category.id]);
              }}
            />
          </li>
        )}
      </ul>
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
