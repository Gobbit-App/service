import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import { currentToast, dismissToast } from '../ui/toast-store';

const POST = vi.fn();
const DELETE = vi.fn();
const unwrap = vi.fn();
vi.mock('../api/client', () => ({ api: { POST, DELETE }, unwrap }));
const { availableActions, CardActions, DELETE_CONFIRM } = await import('./CardActions');

const published = makeItem({ id: 'i1' });
const archived = makeItem({ id: 'i1', status: 'archived' });
const deleted = makeItem({ id: 'i1', deletedAt: '2026-01-02T00:00:00.000Z' });
const proposal = makeItem({ id: 'i1', status: 'proposed' });

const buttons = () => screen.queryAllByRole('button').map((b) => b.textContent);

beforeEach(() => {
  POST.mockReset();
  DELETE.mockReset();
  unwrap.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  const toast = currentToast();
  if (toast) dismissToast(toast.id);
});

describe('availableActions (FR-014)', () => {
  it('gives editors archive/restore only, owners and maintainers delete too', () => {
    expect(availableActions(published, 'editor')).toEqual(['archive']);
    expect(availableActions(archived, 'editor')).toEqual(['restore']);
    expect(availableActions(published, 'maintainer')).toEqual(['archive', 'delete']);
    expect(availableActions(archived, 'owner')).toEqual(['restore', 'delete']);
  });

  it('gives readers nothing, proposals nothing, deleted cards undelete for item.delete', () => {
    expect(availableActions(published, 'reader')).toEqual([]);
    expect(availableActions(proposal, 'owner')).toEqual([]);
    expect(availableActions(deleted, 'owner')).toEqual(['undelete']);
    expect(availableActions(deleted, 'editor')).toEqual([]);
  });
});

describe('CardActions', () => {
  it('renders nothing for a reader', () => {
    const { container } = renderWithClient(
      <CardActions item={published} deckSlug="family" role="reader" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the role-gated buttons', () => {
    renderWithClient(<CardActions item={archived} deckSlug="family" role="owner" />);
    expect(buttons()).toEqual(['Restore', 'Delete']);
  });

  it('archives, toasts with Undo and reports back', async () => {
    const onDone = vi.fn();
    renderWithClient(
      <CardActions item={published} deckSlug="family" role="editor" onDone={onDone} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(POST).toHaveBeenCalledWith('/items/{id}/archive', { params: { path: { id: 'i1' } } }),
    );
    expect(onDone).toHaveBeenCalledWith('archive');
    expect(currentToast()?.message).toBe('Card archived');
    expect(currentToast()?.action?.label).toBe('Undo');
  });

  it('Undo sends the inverse action', async () => {
    renderWithClient(<CardActions item={published} deckSlug="family" role="editor" />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(POST).toHaveBeenCalledTimes(1));

    act(() => currentToast()!.action!.onAction());

    await waitFor(() =>
      expect(POST).toHaveBeenLastCalledWith('/items/{id}/restore', {
        params: { path: { id: 'i1' } },
      }),
    );
  });

  it('asks before deleting and sends nothing when cancelled', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithClient(<CardActions item={published} deckSlug="family" role="owner" />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(confirm).toHaveBeenCalledWith(DELETE_CONFIRM);
    expect(DELETE).not.toHaveBeenCalled();
    expect(currentToast()).toBeNull();
  });

  it('deletes after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithClient(<CardActions item={published} deckSlug="family" role="owner" />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(DELETE).toHaveBeenCalledTimes(1));
    expect(currentToast()?.message).toBe('Card deleted');
  });

  it('shows the server problem when the action fails', async () => {
    unwrap.mockRejectedValue(new Error('offline'));
    renderWithClient(<CardActions item={published} deckSlug="family" role="editor" />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(currentToast()?.message).toMatch(/Couldn't archive the card/));
  });

  it('disables the actions offline with a hint', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderWithClient(<CardActions item={published} deckSlug="family" role="owner" />);

    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.getByText(/these actions need a connection/)).toBeInTheDocument();
  });

  describe('link checks (D165)', () => {
    const health = { status: 'dead' as const, checkedAt: '2026-10-20T06:30:00.000Z' };
    const flagged = makeItem({
      id: 'i1',
      type: 'link',
      payload: { url: 'https://e.com' },
      linkHealth: health,
    });

    it('offers Check again and Dismiss to editors on flagged links only', () => {
      renderWithClient(<CardActions item={flagged} deckSlug="family" role="editor" />);
      expect(buttons()).toEqual(['Check again', 'Dismiss', 'Archive']);
    });

    it('shows readers nothing, and no link buttons on healthy links', () => {
      const { container } = renderWithClient(
        <CardActions item={flagged} deckSlug="family" role="reader" />,
      );
      expect(container).toBeEmptyDOMElement();
      renderWithClient(
        <CardActions item={{ ...flagged, linkHealth: null }} deckSlug="family" role="editor" />,
      );
      expect(buttons()).toEqual(['Archive']);
    });

    it('Check again posts and toasts the result', async () => {
      unwrap.mockResolvedValue({ ...flagged, linkHealth: null });
      renderWithClient(<CardActions item={flagged} deckSlug="family" role="editor" />);

      fireEvent.click(screen.getByRole('button', { name: 'Check again' }));

      await waitFor(() => expect(currentToast()?.message).toBe('Link looks fine'));
      expect(POST).toHaveBeenCalledWith('/items/{id}/link-check', {
        params: { path: { id: 'i1' } },
      });
    });

    it('Dismiss deletes the flag and clears it from the cached card', async () => {
      const { queryClient } = renderWithClient(
        <CardActions item={flagged} deckSlug="family" role="editor" />,
      );
      queryClient.setQueryData(['item', 'i1'], flagged);

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

      await waitFor(() => expect(currentToast()?.message).toBe('Note dismissed'));
      expect(DELETE).toHaveBeenCalledWith('/items/{id}/link-check/flag', {
        params: { path: { id: 'i1' } },
      });
      expect(
        queryClient.getQueryData<{ linkHealth: unknown }>(['item', 'i1'])?.linkHealth,
      ).toBeNull();
    });

    it('shows the rate limit detail when Check again is refused', async () => {
      const { ApiError } = await import('../api/api-error');
      unwrap.mockRejectedValue(
        new ApiError(429, {
          type: '/problems/rate-limited',
          title: 'Too many',
          status: 429,
          detail: 'Try again later.',
        }),
      );
      renderWithClient(<CardActions item={flagged} deckSlug="family" role="editor" />);

      fireEvent.click(screen.getByRole('button', { name: 'Check again' }));

      await waitFor(() => expect(currentToast()?.message).toBe('Try again later.'));
    });
  });
});
