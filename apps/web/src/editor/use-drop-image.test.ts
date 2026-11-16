import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDropImage } from './use-drop-image';

const png = new File(['x'], 'a.png', { type: 'image/png' });
const jpg = new File(['x'], 'b.jpg', { type: 'image/jpeg' });
const pdf = new File(['x'], 'c.pdf', { type: 'application/pdf' });

function fire(el: HTMLElement, type: 'dragover' | 'drop', files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: files.length ? ['Files'] : ['text/plain'], files },
  });
  el.dispatchEvent(event);
  return event;
}

function setup() {
  const el = document.createElement('div');
  const onImage = vi.fn();
  const hook = renderHook(() => useDropImage({ current: el }, onImage));
  return { el, onImage, ...hook };
}

describe('useDropImage', () => {
  it('hands a dropped image over and allows the drop', () => {
    const { el, onImage } = setup();
    expect(fire(el, 'dragover', [png]).defaultPrevented).toBe(true);
    expect(fire(el, 'drop', [png]).defaultPrevented).toBe(true);
    expect(onImage).toHaveBeenCalledWith(png);
  });

  it('takes the first image among several files', () => {
    const { el, onImage } = setup();
    fire(el, 'drop', [pdf, jpg, png]);
    expect(onImage).toHaveBeenCalledTimes(1);
    expect(onImage).toHaveBeenCalledWith(jpg);
  });

  it('ignores non-image files and drags without files', () => {
    const { el, onImage } = setup();
    fire(el, 'drop', [pdf]);
    expect(fire(el, 'dragover', []).defaultPrevented).toBe(false);
    fire(el, 'drop', []);
    expect(onImage).not.toHaveBeenCalled();
  });

  it('stops listening on unmount', () => {
    const { el, onImage, unmount } = setup();
    unmount();
    fire(el, 'drop', [png]);
    expect(onImage).not.toHaveBeenCalled();
  });
});
