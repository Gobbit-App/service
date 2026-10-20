import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageElement, pagingBehavior, scrollToPage } from './motion';

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

  it('scrolls the page to the top of the container', () => {
    const root = container();
    const page = pageElement(root, 'a') as HTMLElement;
    page.scrollIntoView = vi.fn();
    scrollToPage(root, 'a', 'instant');
    expect(page.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
    expect(() => scrollToPage(root, 'missing', 'smooth')).not.toThrow();
  });
});
