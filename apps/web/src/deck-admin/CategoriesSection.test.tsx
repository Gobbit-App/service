import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../api/query-keys';
import { makeCategory, makeDeck } from '../test/fixtures';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, requests } = await import('../test/api-mock');
const { CategoriesSection } = await import('./CategoriesSection');

const deck = makeDeck();
const schools = makeCategory({ id: 'c1', name: 'Schools', visibility: 'shared' });

function setup(online = true) {
  respond.mockImplementation(async (request) => {
    if (request === 'PATCH /decks/{id}/categories/{categoryId}') return schools;
    throw new Error(`unexpected ${request}`);
  });
  return renderWithClient(<CategoriesSection deck={deck} categories={[schools]} online={online} />);
}

const patches = () =>
  requests.mock.calls
    .filter(([r]) => r === 'PATCH /decks/{id}/categories/{categoryId}')
    .map(([, init]) => init as { params: { path: unknown }; body: unknown });

describe('CategoriesSection (D184)', () => {
  beforeEach(() => {
    respond.mockReset();
    requests.mockClear();
  });

  it('offers the three visibility labels', () => {
    setup();
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Admins only', 'Members', 'Everyone']);
  });

  it('a visibility change sends the category PATCH and refetches the list', async () => {
    const { queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    fireEvent.change(screen.getByLabelText('Who sees Schools'), { target: { value: 'public' } });
    await waitFor(() =>
      expect(patches()).toEqual([
        { params: { path: { id: deck.id, categoryId: 'c1' } }, body: { visibility: 'public' } },
      ]),
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.categories(deck.slug) }),
    );
  });

  it('renames with a Save that appears once the name changes', async () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Name of Schools'), { target: { value: 'Kids' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches()[0]?.body).toEqual({ name: 'Kids' }));
  });

  it('is read-only offline', () => {
    setup(false);
    expect(screen.getByLabelText('Name of Schools')).toBeDisabled();
    expect(screen.getByLabelText('Who sees Schools')).toBeDisabled();
  });
});
