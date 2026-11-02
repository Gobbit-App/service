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
  it('maps the contract keys (D247: ←/→ move between cards)', () => {
    expect(press('ArrowRight')).toBe('next-card');
    expect(press('PageDown')).toBe('next-card');
    expect(press('ArrowLeft')).toBe('prev-card');
    expect(press('PageUp')).toBe('prev-card');
    expect(press('Escape')).toBe('close');
  });

  it('leaves ↑/↓ and other keys native', () => {
    expect(press('ArrowDown')).toBeNull();
    expect(press('ArrowUp')).toBeNull();
    expect(press('a')).toBeNull();
    expect(press('Enter')).toBeNull();
  });

  it('ignores modifier chords and handled keys', () => {
    expect(press('ArrowRight', document.body, { altKey: true })).toBeNull();
    expect(press('ArrowLeft', document.body, { metaKey: true })).toBeNull();
    expect(press('PageDown', document.body, { shiftKey: true })).toBeNull();
    expect(press('Escape', document.body, { defaultPrevented: true })).toBeNull();
  });

  it('leaves text fields and menus alone (except Escape)', () => {
    document.body.innerHTML =
      '<input id="f" /><ul role="menu"><li><button id="m">x</button></li></ul>';
    expect(press('ArrowLeft', document.getElementById('f'))).toBeNull();
    expect(press('ArrowRight', document.getElementById('m'))).toBeNull();
    expect(press('Escape', document.getElementById('f'))).toBe('close');
  });

  it('acts without a target element', () => {
    expect(press('ArrowRight', null)).toBe('next-card');
  });
});
