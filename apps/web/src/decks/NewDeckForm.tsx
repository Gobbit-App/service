import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { useCreateDeck } from '../api/create-deck';
import { AdminError } from '../deck-admin/AdminError';
import { Button } from '../ui/buttons/Button';
import { deckHref } from '../ui/chip-order';
import { useNavigateHref } from '../ui/NavLink';

/**
 * D269: "New deck" on the deck list. Collapsed to one button; the form asks only for a name.
 * A created deck opens on its settings, where its members are invited.
 */
export function NewDeckForm(): ReactElement {
  const baseId = useId();
  const create = useCreateDeck();
  const navigate = useNavigateHref();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  if (!open) {
    return (
      <Button
        icon="plus"
        label="New deck"
        variant="ghost"
        className="new-deck__open"
        onClick={() => setOpen(true)}
      />
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(name, {
      onSuccess: (deck) => navigate(deckHref(deck.slug, 'settings')),
    });
  };

  const handleCancel = () => {
    setOpen(false);
    setName('');
    create.reset();
  };

  return (
    <form className="card-editor new-deck" onSubmit={handleSubmit} aria-label="New deck">
      <label htmlFor={`${baseId}-name`}>Deck name</label>
      <input
        id={`${baseId}-name`}
        value={name}
        autoFocus
        dir="auto"
        disabled={create.isPending}
        aria-invalid={create.isError || undefined}
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <AdminError error={create.error} />
      <div className="new-deck__actions">
        <Button
          type="submit"
          icon="plus"
          label={create.isPending ? 'Creating…' : 'Create deck'}
          disabled={create.isPending || name.trim() === ''}
        />
        <Button
          icon="close"
          label="Cancel"
          variant="ghost"
          disabled={create.isPending}
          onClick={handleCancel}
        />
      </div>
    </form>
  );
}
