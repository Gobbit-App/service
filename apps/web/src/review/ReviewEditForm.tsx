import { useId, useState, type FormEvent, type ReactElement } from 'react';
import type { Category, Item, ItemPatch } from '@pb/shared';
import { buildReviewPatch, draftFromItem, type ReviewDraft } from './review-edit';

/** D107: inline edit of a proposal before publishing (title, text, link, categories). */
export function ReviewEditForm({
  item,
  categories,
  saving,
  errors,
  onSave,
  onCancel,
}: {
  item: Item;
  categories: readonly Category[];
  saving: boolean;
  errors: readonly string[];
  onSave: (patch: ItemPatch) => void;
  onCancel: () => void;
}): ReactElement {
  const baseId = useId();
  const [draft, setDraft] = useState<ReviewDraft>(() => draftFromItem(item));
  const update = (changes: Partial<ReviewDraft>) => setDraft((prev) => ({ ...prev, ...changes }));

  const toggleCategory = (id: string, checked: boolean) =>
    update({
      categoryIds: checked
        ? [...draft.categoryIds, id]
        : draft.categoryIds.filter((existing) => existing !== id),
    });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const patch = buildReviewPatch(item, draft);
    if (patch) onSave(patch);
    else onCancel();
  };

  return (
    <form className="card-editor review-edit" onSubmit={handleSubmit}>
      <label htmlFor={`${baseId}-title`}>Title</label>
      <input
        id={`${baseId}-title`}
        type="text"
        required
        value={draft.title}
        onChange={(event) => update({ title: event.currentTarget.value })}
      />

      {item.type === 'link' && (
        <>
          <label htmlFor={`${baseId}-url`}>URL</label>
          <input
            id={`${baseId}-url`}
            type="url"
            required
            value={draft.url}
            onChange={(event) => update({ url: event.currentTarget.value })}
          />
        </>
      )}

      <label htmlFor={`${baseId}-body`}>Text</label>
      <textarea
        id={`${baseId}-body`}
        rows={4}
        value={draft.body}
        onChange={(event) => update({ body: event.currentTarget.value })}
      />

      <fieldset>
        <legend>Categories</legend>
        {categories.map((category) => (
          <label key={category.id} className="card-editor__choice">
            <input
              type="checkbox"
              checked={draft.categoryIds.includes(category.id)}
              onChange={(event) => toggleCategory(category.id, event.currentTarget.checked)}
            />
            {category.name}
          </label>
        ))}
      </fieldset>

      {errors.length > 0 && (
        <div className="form-error" role="alert">
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <div className="review-card__buttons">
        <button type="submit" className="button" disabled={saving}>
          Save
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
