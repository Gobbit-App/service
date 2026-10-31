import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NAME_MAX } from '@gobbit/shared/card-limits';
import { ApiError } from '../../api/api-error';
import { requests, respond } from '../../test/api-mock';
import { makeCategory, makeDeck } from '../../test/fixtures';
import { renderWithClient } from '../../test/render';

vi.mock('../../api/client', () => import('../../test/api-mock').then((m) => m.clientModule));
const { CategoryChips } = await import('./CategoryChips');

const general = makeCategory({ id: 'c-general', slug: 'general', name: 'General' });

function setup(role: 'reader' | 'editor' | 'owner' = 'editor') {
  const onChange = vi.fn();
  renderWithClient(
    <CategoryChips
      deck={makeDeck({ role })}
      categories={[general]}
      selected={['c-general']}
      onChange={onChange}
    />,
  );
  return { onChange };
}

const openNew = () => fireEvent.click(screen.getByRole('button', { name: 'New category' }));
const nameInput = () => screen.getByLabelText('New category name');
const typeName = (value: string) => fireEvent.change(nameInput(), { target: { value } });

beforeEach(() => {
  respond.mockReset();
  requests.mockReset();
});

describe('CategoryChips: inline create (US6)', () => {
  it('offers "New category" only to roles that may create one', () => {
    setup('reader');
    expect(screen.queryByRole('button', { name: 'New category' })).toBeNull();
  });

  it('creates the category and selects it', async () => {
    respond.mockImplementation((request) =>
      request === 'POST /decks/{id}/categories'
        ? Promise.resolve(makeCategory({ id: 'c-school', slug: 'school', name: 'School' }))
        : Promise.resolve({ data: [] }),
    );
    const { onChange } = setup();
    openNew();
    typeName('School');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['c-general', 'c-school']));
    const post = requests.mock.calls.find(([r]) => r === 'POST /decks/{id}/categories');
    expect((post?.[1] as { body: unknown }).body).toEqual({ name: 'School' });
    expect(screen.getByRole('button', { name: 'New category' })).toBeInTheDocument();
  });

  it('Enter adds without submitting the editor form', async () => {
    respond.mockResolvedValueOnce(makeCategory({ id: 'c-x', name: 'X' }));
    const { onChange } = setup();
    openNew();
    typeName('X');
    fireEvent.keyDown(nameInput(), { key: 'Enter' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['c-general', 'c-x']));
  });

  it('a 409 selects the same-named category from the refreshed list', async () => {
    const school = makeCategory({ id: 'c-school', slug: 'school', name: 'School' });
    respond.mockImplementation((request) =>
      request === 'POST /decks/{id}/categories'
        ? Promise.reject(new ApiError(409, { status: 409, detail: 'Slug already used' }))
        : Promise.resolve({ data: [general, school] }),
    );
    const { onChange } = setup();
    openNew();
    typeName('school');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['c-general', 'c-school']));
  });

  it('a 409 with no visible match shows the problem detail', async () => {
    respond.mockImplementation((request) =>
      request === 'POST /decks/{id}/categories'
        ? Promise.reject(new ApiError(409, { status: 409, detail: 'Slug already used' }))
        : Promise.resolve({ data: [general] }),
    );
    const { onChange } = setup();
    openNew();
    typeName('Admin');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slug already used');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('caps the name at NAME_MAX and needs a non-blank name', () => {
    setup('owner');
    openNew();
    expect(nameInput()).toHaveAttribute('maxLength', String(NAME_MAX));
    typeName('   ');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('New category name')).toBeNull();
  });
});
