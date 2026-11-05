import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  FakeIntersectionObserver,
  installIntersectionObserver,
} from '../test/intersection-observer';
import { makeCategory, makeItem } from '../test/fixtures';
import { renderWithClient } from '../test/render';
import type { BrowseLayer } from './browse-layer';
import type { BrowseSearch } from './browse-params';
import { END_PAGE_ID } from './EndPage';
import { BROWSE_HINT_KEY, dismissHint } from './hint-store';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { BrowseScreen } = await import('./BrowseScreen');
const { NOT_FOUND_COPY } = await import('./BrowseStack');

const categories = [
  makeCategory({ id: 'c-food', slug: 'food', name: 'Food', isDefault: false, position: 1 }),
  makeCategory({ id: 'c-school', slug: 'school', name: 'School', isDefault: false, position: 2 }),
];
const items = Array.from({ length: 6 }, (_, n) =>
  makeItem({ id: `i${n + 1}`, title: `Card ${n + 1}`, categoryIds: n === 0 ? ['c-food'] : [] }),
);

/** Each page sits 1000 px after the previous one on its track, so scroll targets are readable. */
const PAGE = 1000;
const scrollTo = vi.fn();

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce && query.includes('reduce'), media: query })),
  );
}

function siblingOffset(this: HTMLElement): number {
  const siblings = this.parentElement ? Array.from(this.parentElement.children) : [];
  return Math.max(0, siblings.indexOf(this)) * PAGE;
}

interface Harness {
  onChange: Mock;
  onClose: Mock;
  layers: BrowseLayer[];
}

function renderScreen(search: Partial<BrowseSearch> = {}): Harness {
  const harness: Harness = { onChange: vi.fn(), onClose: vi.fn(), layers: [] };
  function Route() {
    const [address, setAddress] = useState<BrowseSearch>({ c: 'all', ...search });
    const [layer, setLayer] = useState<BrowseLayer | null>(null);
    return (
      <BrowseScreen
        deckSlug="family"
        search={address}
        onChange={(next) => {
          harness.onChange(next);
          setAddress(next);
        }}
        onClose={harness.onClose}
        layer={layer}
        onLayer={(next) => {
          harness.layers.push(next);
          setLayer(next);
        }}
        // System back off the layer's entry.
        onCloseLayer={() => setLayer(null)}
      />
    );
  }
  renderWithClient(<Route />);
  return harness;
}

function pageOf(id: string): HTMLElement {
  const page = document.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
  if (!page) throw new Error(`no page ${id}`);
  return page;
}

function categoryPage(slug: string): HTMLElement {
  const page = document.querySelector<HTMLElement>(`.browse-cat[data-category="${slug}"]`);
  if (!page) throw new Error(`no category ${slug}`);
  return page;
}

/** The active card track (the shown category's). */
function cardTrack(): HTMLElement {
  const track = document.querySelector<HTMLElement>('.browse-cat:not([inert]) .browse__track');
  if (!track) throw new Error('no card track');
  return track;
}

function categoryTrack(): HTMLElement {
  const track = document.querySelector<HTMLElement>('.browse__categories');
  if (!track) throw new Error('no category track');
  return track;
}

/** The last scroll of `track`. */
function lastScroll(track: HTMLElement): ScrollToOptions | undefined {
  const index = scrollTo.mock.contexts.findLastIndex((context) => context === track);
  return index < 0 ? undefined : (scrollTo.mock.calls[index]?.[0] as ScrollToOptions);
}

const live = () => document.querySelector('[aria-live="polite"]');

beforeEach(() => {
  respond.mockReset();
  respond.mockImplementation((request) => {
    if (request.endsWith('/categories')) return Promise.resolve({ data: categories });
    if (request.endsWith('/items')) return Promise.resolve({ data: items, nextCursor: null });
    return Promise.reject(new Error(`unexpected ${request}`));
  });
  installIntersectionObserver();
  scrollTo.mockReset();
  Element.prototype.scrollTo = scrollTo as unknown as Element['scrollTo'];
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(siblingOffset);
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(siblingOffset);
  stubReducedMotion(false);
  dismissHint();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('BrowseScreen: cards (vertical)', () => {
  it('renders one page per card plus the end page, only the current one exposed', async () => {
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Card 1' })).toBeInTheDocument();
    const track = cardTrack();
    expect(track.querySelectorAll('.browse-page')).toHaveLength(7);
    expect(within(track).getByRole('heading', { name: 'Card 1' })).toBeInTheDocument();
    // ±1 mounted (D144): card 4 is an empty placeholder.
    const page4 = track.querySelector('[data-item-id="i4"]');
    expect(page4).toBeEmptyDOMElement();
    expect(track.querySelector('[data-item-id="i2"]')).toHaveAttribute('aria-hidden', 'true');
    expect(track.querySelector(`[data-item-id="${END_PAGE_ID}"]`)).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(live()).toHaveTextContent('Card 1 of 6');
    expect(screen.getByText('1 / 6')).toBeInTheDocument();
  });

  it('shows only the card surface: no chips, no age, actions in the dock (D327)', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    const page = cardTrack().querySelector('[data-item-id="i1"]') as HTMLElement;
    expect(within(page).queryByRole('list', { name: 'Categories' })).not.toBeInTheDocument();
    expect(within(page).queryByRole('region', { name: 'Details' })).not.toBeInTheDocument();
    expect(within(page).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full view' })).toBeInTheDocument();
  });

  it('opens on the deep-linked card', async () => {
    renderScreen({ i: 'i4' });
    expect(await screen.findByRole('heading', { name: 'Card 4' })).toBeInTheDocument();
    expect(lastScroll(cardTrack())).toEqual({ top: 3 * PAGE, behavior: 'instant' });
    expect(screen.queryByText(NOT_FOUND_COPY)).not.toBeInTheDocument();
  });

  it('opens on the first card with a notice when the deep link is not here', async () => {
    renderScreen({ i: 'gone' });
    expect(await screen.findByText(NOT_FOUND_COPY)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Card 1' })).toBeInTheDocument();
  });

  it('pages with ArrowDown/PageDown and keeps ArrowUp at the first card', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    const track = cardTrack();
    scrollTo.mockClear();
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(lastScroll(track)).toBeUndefined();
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(lastScroll(track)).toEqual({ top: PAGE, behavior: 'smooth' });
  });

  it('pages instantly under reduced motion', async () => {
    stubReducedMotion(true);
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    fireEvent.keyDown(document.body, { key: 'PageDown' });
    expect(lastScroll(cardTrack())).toEqual({ top: PAGE, behavior: 'auto' });
  });

  it('moves with the dock buttons, Previous inert on the first card', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    const track = cardTrack();
    scrollTo.mockClear();
    const previous = screen.getByRole('button', { name: 'Previous card' });
    expect(previous).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(previous);
    expect(lastScroll(track)).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(lastScroll(track)).toEqual({ top: PAGE, behavior: 'smooth' });
  });

  it('follows the observed card and replaces the address once it settles', async () => {
    const { onChange } = renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    act(() => FakeIntersectionObserver.intersect(pageOf('i2'), 0.9));
    expect(await screen.findByRole('heading', { name: 'Card 2' })).toHaveFocus();
    expect(live()).toHaveTextContent('Card 2 of 6');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ c: 'all', i: 'i2' }));
  });

  it('ends on a page that jumps to the next category, without the end in the address', async () => {
    const { onChange, onClose } = renderScreen({ i: 'i6' });
    await screen.findByRole('heading', { name: 'Card 6' });
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(lastScroll(cardTrack())).toEqual({ top: 6 * PAGE, behavior: 'smooth' });
    onChange.mockClear();
    act(() => FakeIntersectionObserver.intersect(pageOf(END_PAGE_ID), 0.9));
    expect(await screen.findByRole('heading', { name: "You've seen every card" })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Next card' })).not.toBeInTheDocument();
    expect(live()).toHaveTextContent("You've seen every card");
    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }));
    expect(onClose).toHaveBeenCalledWith('all');
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Food' }));
    expect(onChange).toHaveBeenCalledWith({ c: 'food' });
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ i: END_PAGE_ID }));
    // A jump, not a swipe (D328).
    expect(lastScroll(categoryTrack())).toEqual({ left: PAGE, behavior: 'instant' });
  });
});

describe('BrowseScreen: categories (sideways)', () => {
  it('lays the categories side by side, the shown one and its neighbours mounted', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    await waitFor(() => expect(categoryPage('school')).toBeInTheDocument());
    expect(categoryTrack()).toHaveAttribute('dir', 'ltr');
    expect(categoryPage('all')).not.toHaveAttribute('inert');
    expect(categoryPage('food')).toHaveAttribute('inert');
    expect(categoryPage('food').querySelector('.browse__track')).not.toBeNull();
    expect(categoryPage('school')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Category: All, choose another' })).toBeVisible();
  });

  it('steps sideways with ArrowRight and shows the end banner at the first category', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    await waitFor(() => expect(categoryPage('food')).toBeInTheDocument());
    scrollTo.mockClear();
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(lastScroll(categoryTrack())).toBeUndefined();
    expect(screen.getByTestId('browse-banner')).toHaveTextContent('No previous category');
    expect(live()).toHaveTextContent('No previous category');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(lastScroll(categoryTrack())).toEqual({ left: PAGE, behavior: 'smooth' });
  });

  it('arrives at a category once a sideways swipe settles, with the banner and count', async () => {
    const { onChange } = renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    await waitFor(() => expect(categoryPage('food').querySelector('.browse-page')).not.toBeNull());
    act(() => FakeIntersectionObserver.intersect(categoryPage('food'), 0.9));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ c: 'food' }));
    expect(screen.getByTestId('browse-banner')).toHaveTextContent('Food · 6 cards');
    expect(live()).toHaveTextContent('Food, 6 cards');
    expect(categoryPage('food')).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Category: Food, choose another' })).toBeVisible();
  });

  it('jumps from the category list, which closes through history first (D332)', async () => {
    const harness = renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Category: All, choose another' }));
    expect(harness.layers).toEqual(['categories']);
    const list = screen.getByRole('dialog', { name: 'Categories' });
    expect(within(list).getByRole('button', { name: 'All, 6 cards' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    scrollTo.mockClear();
    fireEvent.click(within(list).getByRole('button', { name: 'School' }));
    await waitFor(() => expect(harness.onChange).toHaveBeenCalledWith({ c: 'school' }));
    expect(screen.queryByRole('dialog', { name: 'Categories' })).not.toBeInTheDocument();
    expect(lastScroll(categoryTrack())).toEqual({ left: 2 * PAGE, behavior: 'instant' });
  });

  it('closes the list unchanged on Escape, leaving Browse open', async () => {
    const { onChange, onClose } = renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    fireEvent.click(await screen.findByRole('button', { name: 'Category: All, choose another' }));
    const list = screen.getByRole('dialog', { name: 'Categories' });
    onChange.mockClear();
    fireEvent(list, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('falls back to All for an unknown category', async () => {
    const { onChange } = renderScreen({ c: 'nope' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ c: 'all' }));
  });

  it('shows the list copy for an empty category, sideways moves still working', async () => {
    respond.mockImplementation((request) =>
      Promise.resolve(
        request.endsWith('/categories') ? { data: categories } : { data: [], nextCursor: null },
      ),
    );
    renderScreen({ c: 'food' });
    expect(await screen.findByText('No cards here yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next card' })).not.toBeInTheDocument();
    scrollTo.mockClear();
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(lastScroll(categoryTrack())).toEqual({ left: 0, behavior: 'smooth' });
  });
});

describe('BrowseScreen: full view', () => {
  it('opens from the dock and closes on Escape without leaving Browse', async () => {
    const harness = renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Full view' }));
    expect(harness.layers).toEqual(['full']);
    const view = screen.getByRole('dialog', { name: 'Card 1' });
    expect(within(view).getByRole('button', { name: 'Close full view' })).toHaveFocus();
    expect(within(view).getByRole('region', { name: 'Details' })).toBeInTheDocument();
    expect(document.querySelector('.browse__stage')).toHaveAttribute('inert');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(harness.onClose).not.toHaveBeenCalled();
  });

  it('opens with `f` and browses a card category from it, opening on that card (D336)', async () => {
    const { onChange } = renderScreen();
    // Full view needs a current card, which the dock shows once there is one.
    await screen.findByRole('button', { name: 'Full view' });
    fireEvent.keyDown(document.body, { key: 'f' });
    const view = screen.getByRole('dialog', { name: 'Card 1' });
    fireEvent.click(within(view).getByRole('button', { name: 'Browse Food' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ c: 'food', i: 'i1' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the card keys off while it is open', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Card 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Full view' }));
    scrollTo.mockClear();
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('BrowseScreen: leaving', () => {
  it('closes on Escape and on the close button, to the current category', async () => {
    const { onClose } = renderScreen({ c: 'food' });
    await screen.findByRole('button', { name: 'Category: Food, choose another' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close browse' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledWith('food');
  });
});

describe('BrowseScreen: first-run hint', () => {
  beforeEach(() => localStorage.removeItem(BROWSE_HINT_KEY));

  it('shows "How to browse" once, with the keys off until it is dismissed', async () => {
    const { onClose } = renderScreen();
    const dialog = await screen.findByRole('dialog', { name: 'How to browse' });
    expect(screen.getByRole('button', { name: 'Got it' })).toHaveFocus();
    scrollTo.mockClear();
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(BROWSE_HINT_KEY)).toBe('dismissed');
  });

  it('lists the four moves and keeps focus on its only button (D338)', async () => {
    renderScreen();
    const dialog = await screen.findByRole('dialog', { name: 'How to browse' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(4);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Got it' })).toHaveFocus();
  });
});
