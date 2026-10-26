import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import { currentToast, dismissToast } from '../ui/toast-store';

const GET = vi.fn();
const POST = vi.fn();
const DELETE = vi.fn();
const unwrap = vi.fn();
vi.mock('../api/client', () => ({ api: { GET, POST, DELETE }, unwrap }));
const { CardActionBar, OFFLINE_REASON } = await import('./CardActionBar');
const { DELETE_CONFIRM } = await import('../items/use-card-lifecycle');

const published = makeItem({ id: 'i1' });
const archived = makeItem({ id: 'i1', status: 'archived' });
const deleted = makeItem({ id: 'i1', deletedAt: '2026-01-02T00:00:00.000Z' });

const bar = () => screen.getByRole('group', { name: 'Card actions' });
const barNames = () =>
  Array.from(bar().querySelectorAll('button, a')).map((el) => el.getAttribute('aria-label'));

function openMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
}
const menuNames = () => screen.queryAllByRole('menuitem').map((el) => el.textContent);

beforeEach(() => {
  GET.mockReset();
  POST.mockReset();
  DELETE.mockReset();
  unwrap.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  const toast = currentToast();
  if (toast) dismissToast(toast.id);
});

describe('CardActionBar (D213)', () => {
  it('gives a reader Favorite and Share only, no menu', () => {
    renderWithClient(<CardActionBar item={published} deckSlug="family" role="reader" />);
    expect(barNames()).toEqual(['Add to favorites', 'Share']);
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('gives an owner Edit, Favorite, Share and History/Archive/Delete in the menu', () => {
    renderWithClient(<CardActionBar item={published} deckSlug="family" role="owner" />);
    expect(barNames()).toEqual(['Edit', 'Add to favorites', 'Share', 'More actions']);
    openMenu();
    expect(menuNames()).toEqual(['History', 'Archive', 'Delete']);
    expect(screen.getByRole('menuitem', { name: 'History' })).toHaveAttribute(
      'href',
      '/d/family/log?item=i1',
    );
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('menu__item--danger');
  });

  it('puts Restore in the bar for an archived card', () => {
    renderWithClient(<CardActionBar item={archived} deckSlug="family" role="owner" />);
    expect(barNames()).toContain('Restore');
    openMenu();
    expect(menuNames()).toEqual(['History', 'Delete']);
  });

  it('shows only Undelete on a deleted card', () => {
    renderWithClient(<CardActionBar item={deleted} deckSlug="family" role="owner" />);
    expect(barNames()).toEqual(['Undelete']);
  });

  it('archives from the menu, toasts with Undo and reports back', async () => {
    const onDone = vi.fn();
    renderWithClient(
      <CardActionBar item={published} deckSlug="family" role="editor" onDone={onDone} />,
    );
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() =>
      expect(POST).toHaveBeenCalledWith('/items/{id}/archive', { params: { path: { id: 'i1' } } }),
    );
    expect(onDone).toHaveBeenCalledWith('archive');
    expect(currentToast()?.message).toBe('Card archived');
    expect(currentToast()?.action?.label).toBe('Undo');

    act(() => currentToast()!.action!.onAction());
    await waitFor(() =>
      expect(POST).toHaveBeenLastCalledWith('/items/{id}/restore', {
        params: { path: { id: 'i1' } },
      }),
    );
  });

  it('asks before deleting and sends nothing when cancelled', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithClient(<CardActionBar item={published} deckSlug="family" role="owner" />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(confirm).toHaveBeenCalledWith(DELETE_CONFIRM);
    expect(DELETE).not.toHaveBeenCalled();
    expect(currentToast()).toBeNull();
  });

  it('deletes after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithClient(<CardActionBar item={published} deckSlug="family" role="owner" />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    await waitFor(() => expect(DELETE).toHaveBeenCalledTimes(1));
    expect(currentToast()?.message).toBe('Card deleted');
  });

  it('shows the server problem when the action fails', async () => {
    unwrap.mockRejectedValue(new Error('offline'));
    renderWithClient(<CardActionBar item={archived} deckSlug="family" role="editor" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(currentToast()?.message).toMatch(/Couldn't restore the card/));
  });

  it('keeps server actions visible offline but explains and ignores them', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderWithClient(<CardActionBar item={archived} deckSlug="family" role="owner" />);
    const restore = screen.getByRole('button', { name: 'Restore' });
    expect(restore).toHaveAttribute('aria-disabled', 'true');
    expect(restore).toHaveAttribute('data-tip', `Restore — ${OFFLINE_REASON}`);
    fireEvent.click(restore);
    expect(POST).not.toHaveBeenCalled();
    expect(screen.queryByText(/these actions need a connection/)).not.toBeInTheDocument();
  });

  describe('link checks (D165)', () => {
    const health = { status: 'dead' as const, checkedAt: '2026-10-20T06:30:00.000Z' };
    const flagged = makeItem({
      id: 'i1',
      type: 'link',
      payload: { url: 'https://e.com' },
      linkHealth: health,
    });

    it('puts Check again in the bar and Dismiss in the menu for editors', () => {
      renderWithClient(<CardActionBar item={flagged} deckSlug="family" role="editor" />);
      expect(barNames()).toContain('Check again');
      openMenu();
      expect(menuNames()).toEqual(['Dismiss', 'Archive']);
    });

    it('shows no link actions to readers or on healthy links', () => {
      renderWithClient(<CardActionBar item={flagged} deckSlug="family" role="reader" />);
      expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
      renderWithClient(
        <CardActionBar item={{ ...flagged, linkHealth: null }} deckSlug="family" role="editor" />,
      );
      expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
    });

    it('Check again posts and toasts the result', async () => {
      unwrap.mockResolvedValue({ ...flagged, linkHealth: null });
      renderWithClient(<CardActionBar item={flagged} deckSlug="family" role="editor" />);
      fireEvent.click(screen.getByRole('button', { name: 'Check again' }));

      await waitFor(() => expect(currentToast()?.message).toBe('Link looks fine'));
      expect(POST).toHaveBeenCalledWith('/items/{id}/link-check', {
        params: { path: { id: 'i1' } },
      });
    });

    it('Dismiss deletes the flag and clears it from the cached card', async () => {
      const { queryClient } = renderWithClient(
        <CardActionBar item={flagged} deckSlug="family" role="editor" />,
      );
      queryClient.setQueryData(['item', 'i1'], flagged);
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Dismiss' }));

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
      renderWithClient(<CardActionBar item={flagged} deckSlug="family" role="editor" />);
      fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
      await waitFor(() => expect(currentToast()?.message).toBe('Try again later.'));
    });
  });
});
