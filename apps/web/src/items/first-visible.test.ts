import { afterEach, describe, expect, it } from 'vitest';
import { firstVisibleItemId } from './first-visible';

function card(id: string, bottom: number): string {
  return `<li><article class="card" aria-labelledby="card-title-${id}" data-bottom="${bottom}"></article></li>`;
}

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `<ul class="item-list__items">${html}</ul>`;
  root.querySelectorAll<HTMLElement>('article').forEach((el) => {
    const bottom = Number(el.dataset.bottom);
    el.getBoundingClientRect = () => ({ bottom }) as DOMRect;
  });
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('firstVisibleItemId', () => {
  it('skips cards scrolled above the chrome', () => {
    const root = mount(card('a', 50) + card('b', 140) + card('c', 600));
    expect(firstVisibleItemId(root, 120)).toBe('b');
  });

  it('returns the first card when nothing is scrolled away', () => {
    const root = mount(card('a', 300) + card('b', 600));
    expect(firstVisibleItemId(root, 0)).toBe('a');
  });

  it('is null for an empty list or when every card is above', () => {
    expect(firstVisibleItemId(mount(''), 0)).toBeNull();
    document.body.innerHTML = '';
    expect(firstVisibleItemId(mount(card('a', 10)), 120)).toBeNull();
  });
});
