import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { paste } from '../test/paste';
import { usePasteImage } from './use-paste-image';

const png = new File(['x'], 'image.png', { type: 'image/png' });

function field(tag: 'input' | 'textarea'): HTMLElement {
  return document.body.appendChild(document.createElement(tag));
}

describe('usePasteImage', () => {
  it('takes the first image pasted anywhere on the page', () => {
    const onImage = vi.fn();
    renderHook(() => usePasteImage(onImage, true));
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const event = paste(document.body, [pdf, png]);
    expect(onImage).toHaveBeenCalledWith(png);
    expect(event.defaultPrevented).toBe(true);
  });

  it('takes an image pasted into a text field when there is no text with it', () => {
    const onImage = vi.fn();
    renderHook(() => usePasteImage(onImage, true));
    paste(field('input'), [png]);
    expect(onImage).toHaveBeenCalledWith(png);
  });

  it('leaves text pasted into a text field alone, even with a picture on the clipboard', () => {
    const onImage = vi.fn();
    renderHook(() => usePasteImage(onImage, true));
    const event = paste(field('textarea'), [png], 'from Word');
    expect(onImage).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores pastes without an image, pastes another handler took, and when disabled', () => {
    const onImage = vi.fn();
    const { rerender } = renderHook(({ on }) => usePasteImage(onImage, on), {
      initialProps: { on: true },
    });
    paste(document.body, [], 'just text');
    const taken = (e: Event) => e.preventDefault();
    document.body.addEventListener('paste', taken);
    paste(document.body, [png]);
    document.body.removeEventListener('paste', taken);
    rerender({ on: false });
    paste(document.body, [png]);
    expect(onImage).not.toHaveBeenCalled();
  });
});
