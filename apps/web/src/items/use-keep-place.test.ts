import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeepPlace } from './use-keep-place';

/** Elements whose on-screen top the test moves by hand. */
function fakeCards(tops: Record<string, number>) {
  const element = (id: string) =>
    id in tops ? ({ getBoundingClientRect: () => ({ top: tops[id] }) } as Element) : null;
  return { tops, element };
}

function fakeScroller() {
  const listeners = new Set<() => void>();
  return {
    addEventListener: vi.fn((_: string, fn: () => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: () => void) => listeners.delete(fn)),
    scrollBy: vi.fn(),
    scroll: () => listeners.forEach((fn) => fn()),
  };
}

function setup(initialAnchor: string | null = 'b') {
  const cards = fakeCards({ a: 0, b: 120 });
  const scroller = fakeScroller();
  let anchor = initialAnchor;
  const hook = renderHook(
    ({ data }: { data: unknown }) =>
      useKeepPlace({
        data,
        scroller: () => scroller as unknown as Window,
        anchorId: () => anchor,
        element: cards.element,
      }),
    { initialProps: { data: 1 as unknown } },
  );
  return {
    ...hook,
    cards,
    scroller,
    setAnchor: (id: string | null) => {
      anchor = id;
    },
  };
}

describe('useKeepPlace', () => {
  it('scrolls by as far as the reader’s card moved when the data changes', () => {
    const { cards, scroller, rerender } = setup();
    cards.tops.b = 420; // a new card landed above
    rerender({ data: 2 });
    expect(scroller.scrollBy).toHaveBeenCalledWith({ top: 300, behavior: 'instant' });
  });

  it('scrolls back up when a card above is removed', () => {
    const { cards, scroller, rerender } = setup();
    cards.tops.b = 20;
    rerender({ data: 2 });
    expect(scroller.scrollBy).toHaveBeenCalledWith({ top: -100, behavior: 'instant' });
  });

  it('leaves the scroll alone when the card did not move', () => {
    const { scroller, rerender } = setup();
    rerender({ data: 2 });
    expect(scroller.scrollBy).not.toHaveBeenCalled();
  });

  it('follows the reader: the card on screen after a scroll is the one kept', () => {
    const { cards, scroller, rerender, setAnchor } = setup();
    setAnchor('a');
    cards.tops.a = -40;
    scroller.scroll();
    cards.tops.a = 260;
    rerender({ data: 2 });
    expect(scroller.scrollBy).toHaveBeenCalledWith({ top: 300, behavior: 'instant' });
  });

  it('does nothing when the reader’s card is gone or there is none', () => {
    const { cards, scroller, rerender } = setup();
    delete cards.tops.b;
    rerender({ data: 2 });
    expect(scroller.scrollBy).not.toHaveBeenCalled();

    const empty = setup(null);
    empty.cards.tops.b = 999;
    empty.rerender({ data: 2 });
    expect(empty.scroller.scrollBy).not.toHaveBeenCalled();
  });

  it('stops listening on unmount', () => {
    const { scroller, unmount } = setup();
    unmount();
    expect(scroller.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
