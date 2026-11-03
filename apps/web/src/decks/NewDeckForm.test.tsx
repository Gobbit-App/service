import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import { NavigateContext } from '../ui/NavLink';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { NewDeckForm } = await import('./NewDeckForm');

const navigate = vi.fn();
const onClose = vi.fn();

function renderForm() {
  return renderWithClient(
    <NavigateContext.Provider value={navigate}>
      <NewDeckForm onClose={onClose} />
    </NavigateContext.Provider>,
  );
}

describe('NewDeckForm (D269)', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
    navigate.mockReset();
    onClose.mockReset();
  });

  it('focuses the name field', () => {
    renderForm();
    expect(screen.getByLabelText('Deck name')).toHaveFocus();
  });

  it('creates a shared deck and opens its settings', async () => {
    respond.mockResolvedValue({ ...makeDeck({ slug: 'family', kind: 'shared' }), categories: [] });
    renderForm();
    fireEvent.change(screen.getByLabelText('Deck name'), { target: { value: ' Family ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create deck' }));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/d/family/settings'));
    const [, init] = requests.mock.calls.find(([r]) => r === 'POST /decks')!;
    expect((init as { body: unknown }).body).toEqual({ name: 'Family', kind: 'shared' });
  });

  it('does not submit a blank name', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Deck name'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Create deck' })).toBeDisabled();
    expect(requests).not.toHaveBeenCalled();
  });

  it('shows the server error and stays open', async () => {
    respond.mockRejectedValue(
      new ApiError(400, { errors: [{ path: 'name', message: 'Name is too long' }] }),
    );
    renderForm();
    fireEvent.change(screen.getByLabelText('Deck name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create deck' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is too long');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Deck name')).toBeInTheDocument();
  });

  it('cancel closes the form', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
