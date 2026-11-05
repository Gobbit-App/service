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

afterEach(() => {
  document.body.innerHTML = '';
});

describe('browseKeyAction', () => {
  it('maps the contract keys (D337: ↑/↓ cards, ←/→ categories, f full view)', () => {
    expect(press('ArrowDown')).toBe('next-card');
    expect(press('PageDown')).toBe('next-card');
    expect(press('ArrowUp')).toBe('prev-card');
    expect(press('PageUp')).toBe('prev-card');
    expect(press('ArrowRight')).toBe('next-category');
    expect(press('ArrowLeft')).toBe('prev-category');
    expect(press('f')).toBe('full-view');
    expect(press('Escape')).toBe('close');
  });

  it('leaves other keys native', () => {
    expect(press('a')).toBeNull();
    expect(press('Enter')).toBeNull();
    expect(press('F', document.body, { shiftKey: true })).toBeNull();
  });

  it('ignores modifier chords and handled keys', () => {
    expect(press('ArrowRight', document.body, { altKey: true })).toBeNull();
    expect(press('ArrowLeft', document.body, { metaKey: true })).toBeNull();
    expect(press('PageDown', document.body, { shiftKey: true })).toBeNull();
    expect(press('f', document.body, { ctrlKey: true })).toBeNull();
    expect(press('Escape', document.body, { defaultPrevented: true })).toBeNull();
  });

  it('leaves text fields and menus alone (except Escape)', () => {
    document.body.innerHTML =
      '<input id="f" /><ul role="menu"><li><button id="m">x</button></li></ul>';
    expect(press('ArrowDown', document.getElementById('f'))).toBeNull();
    expect(press('f', document.getElementById('f'))).toBeNull();
    expect(press('ArrowRight', document.getElementById('m'))).toBeNull();
    expect(press('Escape', document.getElementById('f'))).toBe('close');
  });

  it('leaves ←/→ to a focused wide table, but not ↑/↓', () => {
    document.body.innerHTML = '<div class="table-card" tabindex="0" id="t"></div>';
    const table = document.getElementById('t');
    expect(press('ArrowRight', table)).toBeNull();
    expect(press('ArrowLeft', table)).toBeNull();
    expect(press('ArrowDown', table)).toBe('next-card');
  });

  it('acts without a target element', () => {
    expect(press('ArrowDown', null)).toBe('next-card');
  });
});
