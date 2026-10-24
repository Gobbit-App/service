import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCategory } from '../test/fixtures';
import { PublicSwitchDialog } from './PublicSwitchDialog';

const URL = 'https://gobbit.test/p/family';

function setup(categories = [makeCategory()]) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <PublicSwitchDialog
      categories={categories}
      publicUrl={URL}
      pending={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe('PublicSwitchDialog (D184)', () => {
  it('lists only the public categories and the public address', () => {
    setup([
      makeCategory({ id: 'c1', name: 'Schools', visibility: 'public' }),
      makeCategory({ id: 'c2', name: 'Doctors', visibility: 'public' }),
      makeCategory({ id: 'c3', name: 'Passwords', visibility: 'private' }),
      makeCategory({ id: 'c4', name: 'Family news', visibility: 'shared' }),
    ]);
    const dialog = screen.getByRole('dialog', { name: 'Make this deck public?' });
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Schools', 'Doctors']);
    expect(dialog).toHaveTextContent(URL);
    expect(screen.queryByText(/No category is set to Everyone/)).toBeNull();
  });

  it('warns when no category is public', () => {
    setup([makeCategory({ visibility: 'shared' })]);
    expect(screen.getByText(/No category is set to Everyone/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('cancel calls only onCancel; confirm calls onConfirm', () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Make public' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
