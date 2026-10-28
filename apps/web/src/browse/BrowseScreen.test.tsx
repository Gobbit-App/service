import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeIntersectionObserver,
  installIntersectionObserver,
} from '../test/intersection-observer';
import { makeCategory, makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import type { BrowseSearch } from './browse-params';
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
  const full: BrowseSearch = { c: 'all', pane: 'content', ...search };
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
  it('renders the cards as pages with at most three carrying content', async () => {
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Card 1' })).toBeInTheDocument();
    expect(document.querySelectorAll('.browse-page')).toHaveLength(6);
    expect(document.querySelectorAll('.browse-page__content').length).toBeLessThanOrEqual(3);
    expect(pageOf('i1')).not.toHaveAttribute('aria-hidden');
    expect(pageOf('i2')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Card 1 of 6')).toBeInTheDocument();
  });

  it('renders one dock under the pages, outside every page (D218)', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    const docks = document.querySelectorAll('.browse-dock');
    expect(docks).toHaveLength(1);
    expect(docks[0]?.closest('.browse__pages')).toBeNull();
    expect(document.querySelector('.browse__pages')?.nextElementSibling).not.toBeNull();
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Close browse' })).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Content' })).toHaveAttribute(
      'aria-controls',
      'browse-panel-i1',
    );
    expect(document.querySelector('.browse__pages')).toHaveClass('browse__pages--swipe');
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
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(pageOf('i4'));
    expect(screen.queryByText(NOT_FOUND_COPY)).not.toBeInTheDocument();
  });

  it('opens on the first card with a notice when the deep link is not here', async () => {
    renderScreen({ i: 'gone' });
    expect(await screen.findByText(NOT_FOUND_COPY)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Card 1' })).toBeInTheDocument();
  });

  it('pages with PageDown/ArrowDown and keeps PageUp at the first card', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    scrollIntoView.mockClear();
    fireEvent.keyDown(document.body, { key: 'PageUp' });
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(pageOf('i2'));
  });

  it('pages instantly under reduced motion', async () => {
    stubReducedMotion(true);
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    fireEvent.keyDown(document.body, { key: 'PageDown' });
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('follows the observed card and replaces the address once it settles', async () => {
    const { onChange } = renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    act(() => FakeIntersectionObserver.intersect(pageOf('i2'), 0.9));
    expect(await screen.findByRole('heading', { name: 'Card 2' })).toBeInTheDocument();
    expect(screen.getByText('Card 2 of 6')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Card 2' })).toHaveFocus();
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ c: 'all', pane: 'content', i: 'i2' }),
    );
  });

  it('changes category with ArrowRight/ArrowLeft, never past the ends', async () => {
    const { onChange } = renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalled();
    // Retried until the categories have loaded (the cycle is just All before that).
    await waitFor(() => {
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledWith({ c: 'food', pane: 'content' });
    });
  });

  it('closes on Escape and on the close button, to the current category', async () => {
    const { onClose } = renderScreen({ c: 'food' });
    await screen.findByRole('button', { name: 'Category: Food' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(await screen.findByRole('button', { name: 'Close browse' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledWith('food');
  });

  it('falls back to All for an unknown category', async () => {
    const { onChange } = renderScreen({ c: 'nope', pane: 'details' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ c: 'all', pane: 'details' }));
  });

  it('switches the pane from the tabs', async () => {
    const { onChange } = renderScreen({ i: 'i1' });
    await screen.findByRole('heading', { name: 'Card 1' });
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    expect(onChange).toHaveBeenCalledWith({ c: 'all', i: 'i1', pane: 'source' });
  });

  it('shows the list copy for an empty category, with the header still working', async () => {
    respond.mockImplementation((request) =>
      Promise.resolve(
        request.endsWith('/categories') ? { data: categories } : { data: [], nextCursor: null },
      ),
    );
    renderScreen({ c: 'food' });
    expect(await screen.findByText('No cards here yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Category: Food' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^Card / })).not.toBeInTheDocument();
  });

  describe('first-run hint', () => {
    beforeEach(() => localStorage.removeItem(BROWSE_HINT_KEY));

    it('shows "How to browse" once, with the keys off until it is dismissed', async () => {
      const { onClose } = renderScreen();
      const dialog = await screen.findByRole('dialog', { name: 'How to browse' });
      const gotIt = screen.getByRole('button', { name: 'Got it' });
      expect(gotIt).toHaveFocus();
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(localStorage.getItem(BROWSE_HINT_KEY)).toBe('dismissed');
    });
  });
});
