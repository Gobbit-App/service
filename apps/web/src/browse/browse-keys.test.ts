import { afterEach, describe, expect, it } from 'vitest';
import { browseKeyAction } from './browse-keys';

function press(key: string, target: EventTarget | null = document.body, extra = {}) {
  return browseKeyAction({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    target,
    ...extra,
  });
}

function scrollable(el: HTMLElement, scrolls: boolean) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrolls ? 900 : 300 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 300 });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('browseKeyAction', () => {
  it('maps the contract keys', () => {
    expect(press('PageDown')).toBe('next-card');
    expect(press('ArrowDown')).toBe('next-card');
    expect(press('PageUp')).toBe('prev-card');
    expect(press('ArrowUp')).toBe('prev-card');
    expect(press('ArrowRight')).toBe('next-category');
    expect(press('ArrowLeft')).toBe('prev-category');
    expect(press('Escape')).toBe('close');
    expect(press('a')).toBeNull();
    expect(press('Enter')).toBeNull();
  });

  it('ignores modifier chords and handled keys', () => {
    expect(press('ArrowDown', document.body, { altKey: true })).toBeNull();
    expect(press('ArrowLeft', document.body, { metaKey: true })).toBeNull();
    expect(press('PageDown', document.body, { shiftKey: true })).toBeNull();
    expect(press('Escape', document.body, { defaultPrevented: true })).toBeNull();
  });

  it('leaves text fields and the category menu alone (except Escape)', () => {
    document.body.innerHTML =
      '<input id="f" /><ul role="menu"><li><button id="m">x</button></li></ul>';
    expect(press('ArrowLeft', document.getElementById('f'))).toBeNull();
    expect(press('ArrowDown', document.getElementById('m'))).toBeNull();
    expect(press('Escape', document.getElementById('f'))).toBe('close');
  });

  it('leaves ←/→ to the pane tabs but still pages from them', () => {
    document.body.innerHTML = '<div role="tablist"><button id="t">Content</button></div>';
    const tab = document.getElementById('t');
    expect(press('ArrowRight', tab)).toBeNull();
    expect(press('ArrowDown', tab)).toBe('next-card');
  });

  it('lets a scrollable card body take ↑/↓, but not PageUp/PageDown', () => {
    document.body.innerHTML = '<div class="browse-page__content" id="b"><p id="p">text</p></div>';
    const body = document.getElementById('b') as HTMLElement;
    const inner = document.getElementById('p');
    scrollable(body, true);
    expect(press('ArrowDown', inner)).toBeNull();
    expect(press('ArrowUp', body)).toBeNull();
    expect(press('PageDown', inner)).toBe('next-card');
    scrollable(body, false);
    expect(press('ArrowDown', inner)).toBe('next-card');
  });
});
