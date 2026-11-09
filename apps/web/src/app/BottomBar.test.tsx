import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck } from '@gobbit/shared';
import { renderInRouter } from '../test/render-in-router';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { BottomBar } = await import('./BottomBar');

const deck = (role: Deck['role'], isDefault = false) => ({ slug: 'family', role, isDefault });

function answer({ admin = false } = {}) {
  respond.mockImplementation((request) => {
    if (request === 'GET /me/pending')
      return Promise.resolve({ items: [], upcoming: [], comingUp: [] });
    if (request.startsWith('GET /me')) {
      return Promise.resolve({
        user: { id: 'u1', email: 'me@example.com' },
        isPlatformAdmin: admin,
      });
    }
    if (request.includes('/review/count')) return Promise.resolve({ count: 2 });
    return Promise.reject(new Error(`unexpected ${request}`));
  });
}

const bar = () => screen.getByRole('navigation', { name: /actions/i });
const names = () =>
  Array.from(bar().querySelectorAll('button, a')).map((el) => el.getAttribute('aria-label'));

describe('BottomBar (D274–D279)', () => {
  it('shows the bell on every bar page (037)', async () => {
    await renderInRouter(<BottomBar />);
    expect(await screen.findByRole('link', { name: 'Notifications' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });

  beforeEach(() => {
    respond.mockReset();
    answer();
  });

  it('orders ⋯, Browse, Review and Add for owners', async () => {
    await renderInRouter(<BottomBar deck={deck('owner')} />);
    expect(screen.getByRole('navigation', { name: 'Deck actions' })).toBeInTheDocument();
    await screen.findByRole('link', { name: 'Review · 2' });
    expect(names()).toEqual(['Menu', 'Browse', 'Review · 2', 'Notifications', 'Add']);
  });

  it('gives editors Browse and Add but no Review', async () => {
    await renderInRouter(<BottomBar deck={deck('editor')} />);
    expect(names()).toEqual(['Menu', 'Browse', 'Notifications', 'Add']);
  });

  it('gives readers ⋯ and Browse only', async () => {
    await renderInRouter(<BottomBar deck={deck('reader')} />);
    expect(names()).toEqual(['Menu', 'Browse', 'Notifications']);
  });

  it('has no Review on the personal deck', async () => {
    await renderInRouter(<BottomBar deck={deck('owner', true)} />);
    expect(names()).toEqual(['Menu', 'Browse', 'Notifications', 'Add']);
  });

  it('opens the create menu on a short press, New card first', async () => {
    await renderInRouter(<BottomBar deck={deck('owner')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('menuitem', { name: 'New card' })).toHaveFocus();
  });

  it('opens the new card on a long press', async () => {
    const { navigate } = await renderInRouter(<BottomBar deck={deck('editor')} />);
    vi.useFakeTimers();
    try {
      const add = screen.getByRole('button', { name: 'Add' });
      fireEvent.pointerDown(add, { button: 0, clientX: 5, clientY: 5 });
      act(() => vi.advanceTimersByTime(500));
      expect(navigate).toHaveBeenCalledWith('/d/family/new');
      expect(screen.queryByRole('menu')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lists the ⋯ items by role, with the email under Sign out', async () => {
    await renderInRouter(<BottomBar deck={deck('owner')} />, { context: { signOut: vi.fn() } });
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith('GET /me'));
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const items = screen
      .getAllByRole('menuitem')
      .map((el) => el.getAttribute('aria-label') ?? el.textContent);
    expect(items).toEqual(['Settings', 'Upcoming', 'Activity', 'About', 'Sign out']);
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveAccessibleDescription(
      'me@example.com',
    );
  });

  it('opens About from the ⋯ menu and closes it again (D354)', async () => {
    await renderInRouter(<BottomBar deck={deck('reader')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'About' }));
    const about = screen.getByRole('dialog', { name: 'Gobbit' });
    expect(about).toHaveTextContent('Version');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Gobbit' })).toBeNull();
  });

  it('signs out from the ⋯ menu', async () => {
    const signOut = vi.fn(() => Promise.resolve());
    const { location } = await renderInRouter(<BottomBar deck={deck('reader')} />, {
      context: { signOut },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await vi.waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(location()).toBe('/sign-in');
  });

  it('shows New deck on the deck list and nothing deck-specific', async () => {
    const onNewDeck = vi.fn();
    await renderInRouter(<BottomBar onNewDeck={onNewDeck} />);
    expect(screen.getByRole('navigation', { name: 'Actions' })).toBeInTheDocument();
    expect(names()).toEqual(['Menu', 'Notifications', 'New deck']);
    await userEvent.click(screen.getByRole('button', { name: 'New deck' }));
    expect(onNewDeck).toHaveBeenCalledOnce();
  });

  it('has no + on account settings', async () => {
    await renderInRouter(<BottomBar />);
    expect(names()).toEqual(['Menu', 'Notifications']);
  });
});
