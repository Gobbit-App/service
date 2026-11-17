import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCategory, makeItem } from '../test/fixtures';
import {
  FakeIntersectionObserver,
  installIntersectionObserver,
} from '../test/intersection-observer';
import { renderWithClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { FullView, SWIPE_OUT_RATIO } = await import('./FullView');

const food = makeCategory({ id: 'c-food', slug: 'food', name: 'Food', isDefault: false });
const item = makeItem({
  id: 'i1',
  title: 'Pizza place',
  categoryIds: ['c-food'],
  sourceUrl: 'https://pizza.example/menu',
});

function renderFull(shown = item) {
  const onClose = vi.fn();
  const onCategory = vi.fn();
  const { unmount } = renderWithClient(
    <FullView
      item={shown}
      deckSlug="family"
      categories={[food]}
      onClose={onClose}
      onCategory={onCategory}
    />,
  );
  return {
    unmount,
    onClose,
    onCategory,
    dialog: screen.getByRole('dialog', { name: 'Pizza place' }),
  };
}

describe('FullView creator avatar (FR-004)', () => {
  beforeEach(() => {
    installIntersectionObserver();
    respond.mockReturnValue(new Promise(() => undefined));
  });
  const creator = {
    id: '00000000-0000-4000-8000-0000000000a1',
    name: null,
    username: 'dana',
    initials: 'D',
    photo: null,
  };

  it('shows the creator, a placeholder when unknown, nothing for a personal deck', () => {
    const first = renderFull({ ...item, creator });
    expect(screen.getByRole('img', { name: 'Added by dana' })).toBeInTheDocument();
    first.unmount();
    const unknown = renderFull({ ...item, creator: { ...creator, id: null, initials: '' } });
    expect(screen.getByRole('img', { name: /^Added by/ })).not.toHaveTextContent(/\w/);
    unknown.unmount();
    renderFull({ ...item, creator: null });
    expect(screen.queryByRole('img', { name: /^Added by/ })).toBeNull();
  });
});

describe('FullView', () => {
  beforeEach(() => {
    installIntersectionObserver();
    respond.mockReturnValue(new Promise(() => undefined));
  });

  it('shows the card, its categories, details and source, and focuses Close', () => {
    const { dialog } = renderFull();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close full view' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Pizza place' })).toHaveAttribute(
      'id',
      'full-title-i1',
    );
    expect(screen.getByRole('region', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'pizza.example' })).toBeInTheDocument();
  });

  it('closes from the Close button', () => {
    const { onClose } = renderFull();
    fireEvent.click(screen.getByRole('button', { name: 'Close full view' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('browses a category from its button', () => {
    const { onCategory } = renderFull();
    fireEvent.click(screen.getByRole('button', { name: 'Browse Food' }));
    expect(onCategory).toHaveBeenCalledWith('food');
  });

  it('closes once the sheet is swiped away onto the tail, not before (D335)', () => {
    const { onClose, dialog } = renderFull();
    const tail = dialog.querySelector('.browse-full__tail');
    if (!tail) throw new Error('no tail');
    FakeIntersectionObserver.intersect(tail, 0.5);
    expect(onClose).not.toHaveBeenCalled();
    FakeIntersectionObserver.intersect(tail, SWIPE_OUT_RATIO);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('gives focus back to the opener after it closes', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const view = renderWithClient(
      <FullView
        item={item}
        deckSlug="family"
        categories={[food]}
        onClose={vi.fn()}
        onCategory={vi.fn()}
      />,
    );
    expect(opener).not.toHaveFocus();
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
