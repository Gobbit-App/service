import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck } from '@pb/shared';
import { makeCategory, makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { DeckSection, publicDeckUrl } = await import('./DeckSection');

const categories = [makeCategory({ name: 'Schools', visibility: 'public' })];

function setup(deck: Partial<Deck> = {}, online = true) {
  respond.mockImplementation(async (request) => {
    if (request === 'PATCH /decks/{id}') return makeDeck(deck);
    throw new Error(`unexpected ${request}`);
  });
  return renderWithClient(
    <DeckSection deck={makeDeck(deck)} categories={categories} online={online} />,
  );
}

const patchBodies = () =>
  requests.mock.calls
    .filter(([r]) => r === 'PATCH /decks/{id}')
    .map(([, init]) => (init as { body: unknown }).body);

describe('DeckSection (D184)', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  it('renames the deck', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Cousins ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patchBodies()).toEqual([{ name: 'Cousins' }]));
  });

  it('asks before going public and sends isPublic only on confirm', async () => {
    setup();
    fireEvent.click(screen.getByRole('switch', { name: 'Public' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(patchBodies()).toEqual([]);

    fireEvent.click(screen.getByRole('switch', { name: 'Public' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make public' }));
    await waitFor(() => expect(patchBodies()).toEqual([{ isPublic: true }]));
  });

  it('turns public off without asking and shows the address while public', async () => {
    setup({ isPublic: true });
    expect(screen.getByText(publicDeckUrl('family'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy public address' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Public' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(patchBodies()).toEqual([{ isPublic: false }]));
  });

  it('disables the switch for a maintainer', () => {
    setup({ role: 'maintainer' });
    expect(screen.getByRole('switch', { name: 'Public' })).toBeDisabled();
    expect(screen.getByText('Only co-owners can change this.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeEnabled();
  });

  it('has no switch on the personal deck', () => {
    setup({ isDefault: true, slug: 'me' });
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(/always private/)).toBeInTheDocument();
  });

  it('is read-only offline', () => {
    setup({}, false);
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Public' })).toBeDisabled();
  });

  it('shows the server refusal', async () => {
    const { ApiError } = await import('../api/api-error');
    setup();
    respond.mockRejectedValueOnce(new ApiError(403, { title: 'Forbidden' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Cousins' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('permission');
  });
});
