import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DeckPicker } from './DeckPicker';
import { makeDeck } from '../test/fixtures';

describe('DeckPicker (D108)', () => {
  afterEach(() => {
    cleanup();
  });

  const decks = [
    makeDeck({ id: 'd1', slug: 'me', name: 'Mine' }),
    makeDeck({ id: 'd2', slug: 'family', name: 'Family' }),
  ];

  it('shows the current value and one option per deck', () => {
    render(<DeckPicker decks={decks} value="family" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Deck')).toHaveValue('family');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('calls onChange with the selected slug', () => {
    const onChange = vi.fn();
    render(<DeckPicker decks={decks} value="family" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Deck'), { target: { value: 'me' } });
    expect(onChange).toHaveBeenCalledWith('me');
  });
});
