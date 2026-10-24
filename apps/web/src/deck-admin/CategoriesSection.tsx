import { useState, type FormEvent, type ReactElement } from 'react';
import type { Category, CategoryVisibility, Deck } from '@pb/shared';
import { VISIBILITY_LABELS } from '@pb/shared/authz';
import { categoryVisibilities } from '@pb/shared/enums';
import { SettingsSection } from '../settings/SettingsSection';
import { AdminError } from './AdminError';
import { useUpdateCategory } from './deck-admin-queries';

/** D184: rename and the three-way visibility select per category (`category.update`). */
export function CategoriesSection({
  deck,
  categories,
  online,
}: {
  deck: Deck;
  categories: readonly Category[];
  online: boolean;
}): ReactElement {
  return (
    <SettingsSection title="Categories">
      {!deck.isPublic && (
        <p className="muted">“Everyone” categories show only once the deck is public.</p>
      )}
      <ul className="admin-list">
        {categories.map((category) => (
          <CategoryRow key={category.id} deck={deck} category={category} online={online} />
        ))}
      </ul>
    </SettingsSection>
  );
}

function CategoryRow({
  deck,
  category,
  online,
}: {
  deck: Deck;
  category: Category;
  online: boolean;
}): ReactElement {
  const update = useUpdateCategory(deck);
  const [name, setName] = useState(category.name);
  const trimmed = name.trim();
  const disabled = !online || update.isPending;

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || trimmed === category.name) return;
    update.mutate({ categoryId: category.id, patch: { name: trimmed } });
  };

  return (
    <li className="admin-list__item">
      <form className="admin-form__row" onSubmit={handleRename}>
        <input
          aria-label={`Name of ${category.name}`}
          value={name}
          dir="auto"
          disabled={disabled}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        {trimmed !== category.name && (
          <button type="submit" className="button" disabled={disabled || !trimmed}>
            Save
          </button>
        )}
        <select
          aria-label={`Who sees ${category.name}`}
          value={category.visibility}
          disabled={disabled}
          onChange={(event) =>
            update.mutate({
              categoryId: category.id,
              patch: { visibility: event.currentTarget.value as CategoryVisibility },
            })
          }
        >
          {categoryVisibilities.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABELS[v].label}
            </option>
          ))}
        </select>
      </form>
      <AdminError error={update.error} />
    </li>
  );
}
