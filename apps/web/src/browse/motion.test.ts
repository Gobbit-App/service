import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageElement, pagingBehavior, scrollToPage, tallScrollStep } from './motion';

function stubReducedMotion(matches: boolean | 'throws') {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => {
      if (matches === 'throws') throw new Error('no matchMedia');
      return { matches } as MediaQueryList;
    }),
  );
}

function container(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML =
    '<section data-item-id="a"></section><section data-item-id="b&quot;]"></section>';
  return root;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pagingBehavior', () => {
  it('is smooth unless reduced motion is asked for', () => {
    stubReducedMotion(false);
    expect(pagingBehavior()).toBe('smooth');
    stubReducedMotion(true);
    expect(pagingBehavior()).toBe('auto');
  });

  it('falls back to smooth when matchMedia fails', () => {
    stubReducedMotion('throws');
    expect(pagingBehavior()).toBe('smooth');
  });
});

describe('pageElement / scrollToPage', () => {
  it('finds a page by id without building a selector', () => {
    const root = container();
    expect(pageElement(root, 'a')?.dataset.itemId).toBe('a');
    expect(pageElement(root, 'b"]')?.dataset.itemId).toBe('b"]');
    expect(pageElement(root, 'missing')).toBeNull();
    expect(pageElement(null, 'a')).toBeNull();
  });

  it('scrolls only the track: top for cards, left for categories (D325)', () => {
    const root = container();
    const page = pageElement(root, 'a') as HTMLElement;
    Object.defineProperty(page, 'offsetTop', { value: 120 });
    root.scrollTo = vi.fn();
    expect(scrollToPage(root, 'a', 'instant')).toBe(true);
    expect(root.scrollTo).toHaveBeenLastCalledWith({ top: 120, behavior: 'instant' });

    root.innerHTML = '<section data-category="food"></section>';
    const food = root.firstElementChild as HTMLElement;
    Object.defineProperty(food, 'offsetLeft', { value: 780 });
    scrollToPage(root, 'food', 'smooth', { axis: 'x', attr: 'data-category' });
    expect(root.scrollTo).toHaveBeenLastCalledWith({ left: 780, behavior: 'smooth' });
    expect(scrollToPage(root, 'missing', 'smooth')).toBe(false);
  });

  it('does nothing where scrollTo is missing', () => {
    const root = container();
    Object.defineProperty(root, 'scrollTo', { value: undefined });
    expect(scrollToPage(root, 'a', 'smooth')).toBe(false);
    expect(scrollToPage(null, 'a', 'smooth')).toBe(false);
  });
});

describe('tallScrollStep (D337)', () => {
  const view = (scrollTop: number) => ({ scrollTop, clientHeight: 800 });
  const tall = { offsetTop: 0, offsetHeight: 2000 };

  it('scrolls 85 % of the screen while the card has more to show', () => {
    expect(tallScrollStep(view(0), tall, 1)).toBe(680);
    expect(tallScrollStep(view(1000), tall, 1)).toBe(200);
    expect(tallScrollStep(view(1000), tall, -1)).toBe(-680);
  });

  it('returns 0 (page instead) at the end of the card', () => {
    expect(tallScrollStep(view(1200), tall, 1)).toBe(0);
    expect(tallScrollStep(view(0), tall, -1)).toBe(0);
    expect(tallScrollStep(view(0), { offsetTop: 0, offsetHeight: 800 }, 1)).toBe(0);
  });
});
