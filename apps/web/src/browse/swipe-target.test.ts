import { afterEach, describe, expect, it } from 'vitest';
import { ownsSidewaysDrag } from './swipe-target';

function scroller(width: number, scrollWidth: number, overflowX = 'auto'): HTMLElement {
  const el = document.createElement('div');
  el.style.overflowX = overflowX;
  Object.defineProperty(el, 'clientWidth', { value: width });
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth });
  return el;
}

describe('ownsSidewaysDrag', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('leaves plain card content to the pane swipe', () => {
    const zone = document.createElement('div');
    zone.innerHTML = '<article><p id="p">text</p><button id="b">Edit</button></article>';
    document.body.append(zone);
    expect(ownsSidewaysDrag(zone.querySelector('#p'), zone)).toBe(false);
    expect(ownsSidewaysDrag(zone.querySelector('#b'), zone)).toBe(false);
    expect(ownsSidewaysDrag(zone, zone)).toBe(false);
    expect(ownsSidewaysDrag(null, zone)).toBe(false);
  });

  it('gives text entry its own drags', () => {
    const zone = document.createElement('div');
    zone.innerHTML =
      '<input id="i"><textarea id="t"></textarea><div contenteditable="true"><b id="c">x</b></div>';
    document.body.append(zone);
    for (const id of ['#i', '#t', '#c']) {
      expect(ownsSidewaysDrag(zone.querySelector(id), zone)).toBe(true);
    }
  });

  it('gives a horizontally scrolling element (a wide table) its own drags', () => {
    const zone = document.createElement('div');
    const wide = scroller(300, 600);
    const cell = document.createElement('span');
    wide.append(cell);
    zone.append(wide);
    document.body.append(zone);
    expect(ownsSidewaysDrag(cell, zone)).toBe(true);
  });

  it('ignores elements that fit or do not scroll sideways', () => {
    const zone = document.createElement('div');
    const fits = scroller(300, 300);
    const clipped = scroller(300, 600, 'hidden');
    zone.append(fits, clipped);
    document.body.append(zone);
    expect(ownsSidewaysDrag(fits, zone)).toBe(false);
    expect(ownsSidewaysDrag(clipped, zone)).toBe(false);
  });

  it('stops at the zone itself', () => {
    const zone = scroller(300, 600);
    const child = document.createElement('p');
    zone.append(child);
    document.body.append(zone);
    expect(ownsSidewaysDrag(child, zone)).toBe(false);
  });
});
