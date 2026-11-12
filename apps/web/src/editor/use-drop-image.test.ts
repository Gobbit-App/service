import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDropImage } from './use-drop-image';

const png = new File(['x'], 'image.png', { type: 'image/png' });
const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });

function fire(
  target: Element,
  type: string,
  files: File[] = [],
  init: { relatedTarget?: Element | null } = {},
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, types: files.length > 0 ? ['Files'] : [] },
  });
  Object.defineProperty(event, 'relatedTarget', { value: init.relatedTarget ?? null });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function setup() {
  const element = document.body.appendChild(document.createElement('div'));
  const child = element.appendChild(document.createElement('span'));
  const onImage = vi.fn();
  const hook = renderHook(() => useDropImage({ current: element }, onImage));
  return { element, child, onImage, hook };
}

describe('useDropImage', () => {
  it('hands the first image of a drop to onImage and stops the browser opening it', () => {
    const { element, onImage } = setup();
    const event = fire(element, 'drop', [pdf, png]);
    expect(onImage).toHaveBeenCalledWith(png);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores drops without an image', () => {
    const { element, onImage } = setup();
    fire(element, 'drop', [pdf]);
    fire(element, 'drop', []);
    expect(onImage).not.toHaveBeenCalled();
  });

  it('prevents default on dragover carrying files, not otherwise', () => {
    const { element } = setup();
    expect(fire(element, 'dragover', [png]).defaultPrevented).toBe(true);
    expect(fire(element, 'dragover', []).defaultPrevented).toBe(false);
  });

  it('is dragging from dragenter until drop', () => {
    const { element, hook } = setup();
    expect(hook.result.current.dragging).toBe(false);
    fire(element, 'dragenter', [png]);
    expect(hook.result.current.dragging).toBe(true);
    fire(element, 'drop', [png]);
    expect(hook.result.current.dragging).toBe(false);
  });

  it('stops dragging on dragleave out of the element, not between its children', () => {
    const { element, child, hook } = setup();
    fire(element, 'dragenter', [png]);
    fire(element, 'dragleave', [png], { relatedTarget: child });
    expect(hook.result.current.dragging).toBe(true);
    fire(child, 'dragleave', [png], { relatedTarget: document.body });
    expect(hook.result.current.dragging).toBe(false);
  });

  it('does not show dragging for drags without files', () => {
    const { element, hook } = setup();
    fire(element, 'dragenter', []);
    expect(hook.result.current.dragging).toBe(false);
  });
});
