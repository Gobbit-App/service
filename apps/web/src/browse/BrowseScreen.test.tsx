import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeIntersectionObserver,
  installIntersectionObserver,
} from '../test/intersection-observer';
import { makeCategory, makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import type { BrowseSearch } from './browse-params';
import { END_PAGE_ID } from './EndPage';
import { BROWSE_HINT_KEY, dismissHint } from './hint-store';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond, mockConfig } = await import('../test/api-mock');
const { BrowseScreen } = await import('./BrowseScreen');
const { NOT_FOUND_COPY } = await import('./BrowseStack');

const categories = [
  makeCategory({ id: 'c-food', slug: 'food', name: 'Food', isDefault: false, position: 1 }),
  makeCategory({ id: 'c-school', slug: 'school', name: 'School', isDefault: false, position: 2 }),
];
const items = Array.from({ length: 6 }, (_, n) =>
  makeItem({ id: `i${n + 1}`, title: `Card ${n + 1}` }),
);

const scrollIntoView = vi.fn();

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce && query.includes('reduce'), media: query })),
  );
}

function renderScreen(search: Partial<BrowseSearch> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const full: BrowseSearch = { c: 'all', ...search };
  const result = renderWithClient(
    <BrowseScreen deckSlug="family" search={full} onChange={onChange} onClose={onClose} />,
  );
  return { ...result, onChange, onClose };
}

function pageOf(id: string): HTMLElement {
  const page = document.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
  if (!page) throw new Error(`no page ${id}`);
  return page;
}

function rail(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Categories' });
}

const sideways = (behavior: string) => ({ inline: 'start', block: 'nearest', behavior });

beforeEach(() => {
  respond.mockReset();
  respond.mockImplementation((request) => {
    if (request.endsWith('/categories')) return Promise.resolve({ data: categories });
    if (request.endsWith('/items')) return Promise.resolve({ data: items, nextCursor: null });
    return Promise.reject(new Error(`unexpected ${request}`));
  });
  installIntersectionObserver();
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
  stubReducedMotion(false);
  dismissHint();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  mockConfig.cloudinaryCloudName = null;
});

describe('BrowseScreen', () => {
  it('renders one page per card plus the end page, only the current one exposed', async () => {
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Card 1' })).toBeInTheDocument();
    expect(document.querySelectorAll('.browse-page')).toHaveLength(7);
    expect(pageOf(END_PAGE_ID)).toHaveAttribute('aria-hidden', 'true');
    // ±1 mounted (D144): card 4 is an empty placeholder.
    expect(pageOf('i4')).toBeEmptyDOMElement();
    expect(pageOf('i1')).not.toHaveAttribute('aria-hidden');
    expect(pageOf('i2')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Card 1 of 6')).toBeInTheDocument();
    expect(screen.getByText('1 / 6')).toBeInTheDocument();
  });

  it('shows Details and Source under the card on the same page (D246)', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    const page = pageOf('i1');
    expect(within(page).getByRole('region', { name: 'Details' })).toBeInTheDocument();
    expect(within(page).getByRole('region', { name: 'Source' })).toBeInTheDocument();
  });

  it('gives only the current card image priority, sized by CloudImage (D144, D161)', async () => {
    mockConfig.cloudinaryCloudName = 'demo';
    const photos = items.map((item, n) =>
      makeItem({
        ...item,
        type: 'image',
        payload: { publicId: `p${n + 1}`, alt: `Photo ${n + 1}`, width: 4, height: 3 },
      }),
    );
    respond.mockImplementation((request) => {
      if (request.endsWith('/categories')) return Promise.resolve({ data: categories });
      if (request.endsWith('/items')) return Promise.resolve({ data: photos, nextCursor: null });
      return Promise.reject(new Error(`unexpected ${request}`));
    });
    renderScreen();
    const current = await screen.findByAltText('Photo 1');
    expect(current).toHaveAttribute('fetchpriority', 'high');
    expect(current).toHaveAttribute('width', '4');
    expect(current.getAttribute('sizes')).toMatch(/^\d+px$/);
    const next = pageOf('i2').querySelector('.cloud-image__img');
    expect(next).toHaveAttribute('loading', 'lazy');
    expect(next).not.toHaveAttribute('fetchpriority');
  });

  it('opens on the deep-linked card', async () => {
    renderScreen({ i: 'i4' });
    expect(await screen.findByRole('heading', { name: 'Card 4' })).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith(sideways('instant'));
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(pageOf('i4'));
    expect(screen.queryByText(NOT_FOUND_COPY)).not.toBeInTheDocument();
  });

  it('opens on the first card with a notice when the deep link is not here', async () => {
    renderScreen({ i: 'gone' });
    expect(await screen.findByText(NOT_FOUND_COPY)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Card 1' })).toBeInTheDocument();
  });

  it('pages with ArrowRight/PageDown and keeps ArrowLeft at the first card', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    scrollIntoView.mockClear();
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(scrollIntoView).toHaveBeenCalledWith(sideways('smooth'));
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(pageOf('i2'));
  });

  it('leaves ArrowUp/ArrowDown to the page scroll', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    scrollIntoView.mockClear();
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('pages instantly under reduced motion', async () => {
    stubReducedMotion(true);
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    fireEvent.keyDown(document.body, { key: 'PageDown' });
    expect(scrollIntoView).toHaveBeenLastCalledWith(sideways('auto'));
  });

  it('moves with the dock buttons, Previous inert on the first card', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    scrollIntoView.mockClear();
    const previous = screen.getByRole('button', { name: 'Previous card' });
    expect(previous).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(previous);
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(pageOf('i2'));
  });

  it('follows the observed card and replaces the address once it settles', async () => {
    const { onChange } = renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    act(() => FakeIntersectionObserver.intersect(pageOf('i2'), 0.9));
    expect(await screen.findByRole('heading', { name: 'Card 2' })).toBeInTheDocument();
    expect(screen.getByText('Card 2 of 6')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Card 2' })).toHaveFocus();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ c: 'all', i: 'i2' }));
  });

  it('ends on a page that continues to the next category, without changing the address', async () => {
    const { onChange, onClose } = renderScreen({ i: 'i6' });
    await screen.findByRole('heading', { name: 'Card 6' });
    // Next on the last card goes to the end page (D248).
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(pageOf(END_PAGE_ID));
    onChange.mockClear();
    act(() => FakeIntersectionObserver.intersect(pageOf(END_PAGE_ID), 0.9));
    const title = await screen.findByRole('heading', { name: "You've seen every card" });
    expect(title).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Next card' })).not.toBeInTheDocument();
    expect(screen.getByText('6 / 6')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to Food' }));
    expect(onChange).toHaveBeenCalledWith({ c: 'food' });
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ i: END_PAGE_ID }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }));
    expect(onClose).toHaveBeenCalledWith('all');
  });

  it('switches category from the rail, marking the current chip', async () => {
    const { onChange } = renderScreen({ c: 'food' });
    const food = await within(
      await screen.findByRole('navigation', { name: 'Categories' }),
    ).findByRole('button', { name: 'Food' });
    expect(food).toHaveAttribute('aria-current', 'true');
    fireEvent.click(within(rail()).getByRole('button', { name: 'School' }));
    expect(onChange).toHaveBeenCalledWith({ c: 'school' });
  });

  it('closes on Escape and on the close button, to the current category', async () => {
    const { onClose } = renderScreen({ c: 'food' });
    await screen.findByRole('navigation', { name: 'Categories' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close browse' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledWith('food');
  });

  it('falls back to All for an unknown category', async () => {
    const { onChange } = renderScreen({ c: 'nope' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ c: 'all' }));
  });

  it('shows the list copy for an empty category, with the rail still working', async () => {
    respond.mockImplementation((request) =>
      Promise.resolve(
        request.endsWith('/categories') ? { data: categories } : { data: [], nextCursor: null },
      ),
    );
    const { onChange } = renderScreen({ c: 'food' });
    expect(await screen.findByText('No cards here yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next card' })).not.toBeInTheDocument();
    fireEvent.click(await within(rail()).findByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith({ c: 'all' });
  });

  describe('first-run hint', () => {
    beforeEach(() => localStorage.removeItem(BROWSE_HINT_KEY));

    it('shows "How to browse" once, with the keys off until it is dismissed', async () => {
      const { onClose } = renderScreen();
      const dialog = await screen.findByRole('dialog', { name: 'How to browse' });
      const gotIt = screen.getByRole('button', { name: 'Got it' });
      expect(gotIt).toHaveFocus();
      scrollIntoView.mockClear();
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(scrollIntoView).not.toHaveBeenCalled();
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(localStorage.getItem(BROWSE_HINT_KEY)).toBe('dismissed');
    });

    it('keeps focus on its only button', async () => {
      renderScreen();
      const dialog = await screen.findByRole('dialog', { name: 'How to browse' });
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(screen.getByRole('button', { name: 'Got it' })).toHaveFocus();
    });
  });
});
