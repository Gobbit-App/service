import { useId, useState, type FormEvent, type ReactElement } from 'react';
import type { Deck, IngestTokenCreated } from '@pb/shared';
import { INGEST_TOKEN_LABEL_MAX } from '@pb/shared/ingest-constants';
import { useCreateIngestToken } from '../api/ingest-tokens';
import { problemMessages } from '../api/problem-messages';
import { UNBOUND_SCOPE } from './ingest-token-view';

/** D99: label + optional deck binding; the created token goes to `onCreated` (shown once). */
export function NewTokenForm({
  decks,
  disabled,
  onCreated,
}: {
  decks: readonly Deck[];
  disabled: boolean;
  onCreated: (created: IngestTokenCreated) => void;
}): ReactElement {
  const baseId = useId();
  const create = useCreateIngestToken();
  const [label, setLabel] = useState('');
  const [deckId, setDeckId] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    create.mutate(deckId ? { label: trimmed, deckId } : { label: trimmed }, {
      onSuccess: (created) => {
        setLabel('');
        setDeckId('');
        onCreated(created);
      },
    });
  };

  return (
    <form className="card-editor token-form" onSubmit={handleSubmit}>
      <label htmlFor={`${baseId}-label`}>Name</label>
      <input
        id={`${baseId}-label`}
        value={label}
        maxLength={INGEST_TOKEN_LABEL_MAX}
        placeholder="e.g. iPhone Shortcut, work email"
        onChange={(event) => setLabel(event.currentTarget.value)}
      />

      <label htmlFor={`${baseId}-deck`}>Shares go to</label>
      <select
        id={`${baseId}-deck`}
        value={deckId}
        onChange={(event) => setDeckId(event.currentTarget.value)}
      >
        <option value="">{UNBOUND_SCOPE}</option>
        {decks.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.name}
          </option>
        ))}
      </select>

      {create.isError && (
        <div className="form-error" role="alert">
          {problemMessages(create.error).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <button
        type="submit"
        className="button"
        disabled={disabled || create.isPending || label.trim() === ''}
      >
        {create.isPending ? 'Creating…' : 'Create token'}
      </button>
    </form>
  );
}
