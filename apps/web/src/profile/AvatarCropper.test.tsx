import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AvatarCropper, { clampView, CROP_OUTPUT, CROP_UNREADABLE } from './AvatarCropper';

const draw = vi.fn();
const bitmap = { width: 1000, height: 500 };

beforeEach(() => {
  draw.mockClear();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ drawImage: draw }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb, type) => {
    cb(new Blob(['j'], { type: type ?? '' }));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const file = () => new File(['x'], 'me.png', { type: 'image/png' });
const setup = () => {
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn(), onError: vi.fn() };
  render(<AvatarCropper file={file()} {...handlers} />);
  return handlers;
};
const ready = () => waitFor(() => expect(screen.getByLabelText('Zoom')).toBeEnabled());

describe('AvatarCropper (046)', () => {
  it('draws the centred square to a 512x512 JPEG on confirm', async () => {
    const h = setup();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Use photo' }));
    expect(h.onConfirm).toHaveBeenCalledTimes(1);
    expect((h.onConfirm.mock.calls[0]![0] as Blob).type).toBe('image/jpeg');
    // The last draw is the output canvas: the 500 px square centred in the 1000x500 image.
    expect(draw).toHaveBeenLastCalledWith(bitmap, 250, 0, 500, 500, 0, 0, CROP_OUTPUT, CROP_OUTPUT);
  });

  it('zooms in and pans with the arrow keys, never past the image edge', async () => {
    const h = setup();
    await ready();
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '2' } });
    const stage = screen.getByRole('group', { name: /photo position/i });
    for (let i = 0; i < 100; i++) fireEvent.keyDown(stage, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Use photo' }));
    // side 250; moving the photo right shows its left edge, so x clamps at half a side.
    expect(draw).toHaveBeenLastCalledWith(bitmap, 0, 125, 250, 250, 0, 0, CROP_OUTPUT, CROP_OUTPUT);
    expect(h.onConfirm).toHaveBeenCalled();
  });

  it('clamps so the circle stays covered', () => {
    expect(clampView(bitmap as never, { x: -50, y: 9999, zoom: 1 })).toEqual({
      x: 250,
      y: 250,
      zoom: 1,
    });
  });

  it('cancels from the button', async () => {
    const h = setup();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onCancel).toHaveBeenCalled();
    expect(h.onConfirm).not.toHaveBeenCalled();
  });

  it('reports an unreadable file', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')));
    const h = setup();
    await act(async () => undefined);
    await waitFor(() => expect(h.onError).toHaveBeenCalledWith(CROP_UNREADABLE));
  });
});
