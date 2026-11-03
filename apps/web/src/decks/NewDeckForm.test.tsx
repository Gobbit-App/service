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

function renderForm() {
  return renderWithClient(
    <NavigateContext.Provider value={navigate}>
      <NewDeckForm />
    </NavigateContext.Provider>,
  );
}

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'New deck' }));
}

describe('NewDeckForm (D269)', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
    navigate.mockReset();
  });

  it('starts collapsed to one button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'New deck' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Deck name')).not.toBeInTheDocument();
  });

  it('creates a shared deck and opens its settings', async () => {
    respond.mockResolvedValue({ ...makeDeck({ slug: 'family', kind: 'shared' }), categories: [] });
    renderForm();
    openForm();
    fireEvent.change(screen.getByLabelText('Deck name'), { target: { value: ' Family ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create deck' }));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/d/family/settings'));
    const [, init] = requests.mock.calls.find(([r]) => r === 'POST /decks')!;
    expect((init as { body: unknown }).body).toEqual({ name: 'Family', kind: 'shared' });
  });

  it('does not submit a blank name', () => {
    renderForm();
    openForm();
    fireEvent.change(screen.getByLabelText('Deck name'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Create deck' })).toBeDisabled();
    expect(requests).not.toHaveBeenCalled();
  });

  it('shows the server error and stays open', async () => {
    respond.mockRejectedValue(
      new ApiError(400, { errors: [{ path: 'name', message: 'Name is too long' }] }),
    );
    renderForm();
    openForm();
    fireEvent.change(screen.getByLabelText('Deck name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create deck' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is too long');
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Deck name')).toBeInTheDocument();
  });

  it('cancel collapses the form', () => {
    renderForm();
    openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Deck name')).not.toBeInTheDocument();
  });
});
