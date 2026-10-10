import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-error';
import { makeCategory, makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../api/client', () => ({
  api: { POST: postMock },
  unwrap: (request: Promise<unknown>) => request,
}));
const { CardEditor } = await import('./CardEditor');

const categories = [
  makeCategory({ id: 'cat-misc', name: 'Misc', isDefault: false }),
  makeCategory({ id: 'cat-general', name: 'General', isDefault: true }),
];

function renderEditor(onSaved = vi.fn()) {
  renderWithClient(<CardEditor deckSlug="me" categories={categories} onSaved={onSaved} />);
  return { onSaved };
}

describe('CardEditor', () => {
  beforeEach(() => postMock.mockReset());

  it('saves a text card with the default category and calls onSaved', async () => {
    postMock.mockResolvedValueOnce({ data: makeItem() });
    const { onSaved } = renderEditor();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Plumber' } });
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Call Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(postMock).toHaveBeenCalledWith('/decks/{id}/items', {
      params: { path: { id: 'me' } },
      body: {
        type: 'text',
        title: 'Plumber',
        body: 'Call Sam',
        payload: {},
        categoryIds: ['cat-general'],
      },
    });
  });

  it('saves a link card with the url and no body', async () => {
    postMock.mockResolvedValueOnce({ data: makeItem() });
    const { onSaved } = renderEditor();

    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Recipe' } });
    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: 'https://example.com/pie' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(postMock.mock.calls[0][1].body).toEqual({
      type: 'link',
      title: 'Recipe',
      payload: { url: 'https://example.com/pie' },
      categoryIds: ['cat-general'],
    });
  });

  it('toggles Body and URL with the card type', () => {
    renderEditor();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
    expect(screen.queryByLabelText('URL')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.queryByLabelText('Body')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Text' }));
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
  });

  it('defaults the category select to the default category and honours a change', async () => {
    postMock.mockResolvedValueOnce({ data: makeItem() });
    renderEditor();
    const select = screen.getByLabelText('Category');
    expect(select).toHaveValue('cat-general');

    fireEvent.change(select, { target: { value: 'cat-misc' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'T' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    await waitFor(() => expect(postMock).toHaveBeenCalled());
    expect(postMock.mock.calls[0][1].body.categoryIds).toEqual(['cat-misc']);
  });

  it('shows the API field message in role=alert and does not call onSaved', async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(400, {
        title: 'Validation failed',
        errors: [{ path: 'body', message: 'Body must be at most 600 characters' }],
      }),
    );
    const { onSaved } = renderEditor();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Long' } });
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'x'.repeat(601) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Body must be at most 600');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
