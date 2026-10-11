import { useId, useState, type FormEvent, type ReactElement } from 'react';
import type { Category } from '@pb/shared';
import { useCreateItem } from '../api/create-item';
import { problemMessages } from '../api/problem-messages';
import { buildCardInput, defaultCategoryId, type CardType } from './card-input';

const TYPE_OPTIONS: { value: CardType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'link', label: 'Link' },
];

/** Minimal create form for text and link cards (Phase 3B, contract §12). */
export function CardEditor({
  deckSlug,
  categories,
  onSaved,
}: {
  deckSlug: string;
  categories: readonly Category[];
  onSaved: () => void;
}): ReactElement {
  const baseId = useId();
  const save = useCreateItem(deckSlug);
  const [type, setType] = useState<CardType>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [chosenCategory, setChosenCategory] = useState<string | null>(null);
  const categoryId = chosenCategory ?? defaultCategoryId(categories);
  const errorMessages = save.isError ? problemMessages(save.error) : [];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate(buildCardInput({ type, title, body, url, categoryId }), { onSuccess: onSaved });
  };

  return (
    <form className="card-editor" onSubmit={handleSubmit}>
      <fieldset className="card-editor__types">
        <legend>Type</legend>
        {TYPE_OPTIONS.map((option) => (
          <label key={option.value} className="card-editor__choice">
            <input
              type="radio"
              name={`${baseId}-type`}
              value={option.value}
              checked={type === option.value}
              onChange={() => setType(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <label htmlFor={`${baseId}-title`}>Title</label>
      <input
        id={`${baseId}-title`}
        type="text"
        required
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
      />

      {type === 'text' ? (
        <>
          <label htmlFor={`${baseId}-body`}>Body</label>
          <textarea
            id={`${baseId}-body`}
            rows={5}
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
        </>
      ) : (
        <>
          <label htmlFor={`${baseId}-url`}>URL</label>
          <input
            id={`${baseId}-url`}
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.currentTarget.value)}
          />
        </>
      )}

      <label htmlFor={`${baseId}-category`}>Category</label>
      <select
        id={`${baseId}-category`}
        value={categoryId ?? ''}
        onChange={(event) => setChosenCategory(event.currentTarget.value)}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>

      {errorMessages.length > 0 && (
        <div className="form-error" role="alert">
          {errorMessages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <button type="submit" className="button" disabled={save.isPending}>
        Save card
      </button>
    </form>
  );
}
