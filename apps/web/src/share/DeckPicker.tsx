import { useId, type ReactElement } from 'react';
import type { Deck } from '@pb/shared';

/** D108: which pocketbook a share goes to. */
export function DeckPicker({
  decks,
  value,
  onChange,
}: {
  decks: readonly Deck[];
  value: string;
  onChange: (slug: string) => void;
}): ReactElement {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>Pocketbook</label>
      <select id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {decks.map((deck) => (
          <option key={deck.id} value={deck.slug}>
            {deck.name}
          </option>
        ))}
      </select>
    </>
  );
}
