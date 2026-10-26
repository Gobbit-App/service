import { useId, useState, type KeyboardEvent, type ReactElement } from 'react';
import type { Category, Deck } from '@pb/shared';
import { NAME_MAX } from '@pb/shared/card-limits';
import { useCreateCategory } from '../../api/create-category';
import { problemMessages } from '../../api/problem-messages';
import { Button } from '../../ui/buttons/Button';
import { Icon } from '../../ui/icons/Icon';

/**
 * US6: "New category" inline in the chips. Not a nested <form> (the editor is one); Enter adds.
 * The created (or, on a 409, the existing same-named) category is handed to `onCreated`.
 */
export function NewCategory({
  deck,
  disabled,
  onCreated,
}: {
  deck: Pick<Deck, 'id' | 'slug'>;
  disabled: boolean;
  onCreated: (category: Category) => void;
}): ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const create = useCreateCategory(deck);
  const trimmed = name.trim();

  const close = () => {
    setOpen(false);
    setName('');
    create.reset();
  };

  const add = () => {
    if (trimmed === '' || create.isPending) return;
    create.mutate(trimmed, {
      onSuccess: ({ category }) => {
        onCreated(category);
        close();
      },
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="chip chip--add"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" />
        New category
      </button>
    );
  }

  return (
    <div className="new-category">
      <label htmlFor={`${id}-name`} className="visually-hidden">
        New category name
      </label>
      <input
        id={`${id}-name`}
        value={name}
        maxLength={NAME_MAX}
        placeholder="New category name"
        autoFocus
        disabled={create.isPending}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={onKeyDown}
        aria-invalid={create.isError || undefined}
        aria-describedby={create.isError ? `${id}-error` : undefined}
      />
      <Button
        icon="plus"
        label="Add"
        disabled={trimmed === '' || create.isPending}
        aria-busy={create.isPending || undefined}
        onClick={add}
      />
      <Button icon="close" label="Cancel" variant="ghost" onClick={close} />
      {create.isError && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {problemMessages(create.error).join(' ')}
        </p>
      )}
    </div>
  );
}
