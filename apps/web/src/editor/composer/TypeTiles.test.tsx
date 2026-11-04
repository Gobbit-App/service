import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CreatableType } from '../creatable-types';
import { IMAGES_UNAVAILABLE, TYPE_HINTS } from './type-tiles';
import { TypeTiles } from './TypeTiles';

function renderTiles(
  props: Partial<{ value: CreatableType | null; imagesOff: boolean; autoFocus: boolean }> = {},
) {
  const onPick = vi.fn();
  render(
    <TypeTiles
      value={props.value ?? null}
      imagesOff={props.imagesOff ?? false}
      autoFocus={props.autoFocus}
      onPick={onPick}
    />,
  );
  return { onPick, group: screen.getByRole('radiogroup', { name: 'Card type' }) };
}

describe('TypeTiles (D301)', () => {
  it('names each tile by its label and describes it by its hint', () => {
    renderTiles();
    expect(
      screen.getAllByRole('radio').map((tile) => tile.getAttribute('aria-label') ?? ''),
    ).toEqual(['', '', '', '', '', '']);
    expect(screen.getByRole('radio', { name: 'Reminder' })).toBeInTheDocument();
    const table = screen.getByRole('radio', { name: 'Table' });
    expect(table).toHaveAccessibleDescription(TYPE_HINTS.table);
    expect(table).toHaveAttribute('aria-checked', 'false');
  });

  it('checks the current type and makes it the tab stop', () => {
    renderTiles({ value: 'link' });
    const link = screen.getByRole('radio', { name: 'Link' });
    expect(link).toHaveAttribute('aria-checked', 'true');
    expect(link).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Text' })).toHaveAttribute('tabindex', '-1');
  });

  it('focuses the first tile on mount when asked, nothing is picked', async () => {
    const { onPick } = renderTiles({ autoFocus: true });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Text' })).toHaveFocus());
    expect(onPick).not.toHaveBeenCalled();
  });

  it('moves focus with wrapping arrows and Home/End without picking', async () => {
    const { onPick, group } = renderTiles({ autoFocus: true });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Text' })).toHaveFocus());
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'Calc' })).toHaveFocus();
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Text' })).toHaveFocus();
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: 'Reminder' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Reminder' })).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(group, { key: 'End' });
    expect(screen.getByRole('radio', { name: 'Calc' })).toHaveFocus();
    fireEvent.keyDown(group, { key: 'Home' });
    expect(screen.getByRole('radio', { name: 'Text' })).toHaveFocus();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('picks on click (Enter and Space activate the button natively)', () => {
    const { onPick } = renderTiles();
    fireEvent.click(screen.getByRole('radio', { name: 'Calc' }));
    expect(onPick).toHaveBeenCalledWith('calc');
  });

  it('keeps Image visible but unavailable, saying why, when image storage is off', () => {
    const { onPick } = renderTiles({ imagesOff: true });
    const image = screen.getByRole('radio', { name: 'Image' });
    expect(image).toHaveAttribute('aria-disabled', 'true');
    expect(image).toHaveAccessibleDescription(IMAGES_UNAVAILABLE);
    fireEvent.click(image);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('offers Image when image storage is set up', () => {
    const { onPick } = renderTiles();
    const image = screen.getByRole('radio', { name: 'Image' });
    expect(image).not.toHaveAttribute('aria-disabled');
    fireEvent.click(image);
    expect(onPick).toHaveBeenCalledWith('image');
  });
});
