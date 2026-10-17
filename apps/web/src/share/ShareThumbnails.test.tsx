import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ShareThumbnails } from './ShareThumbnails';

const revoke = vi.fn();

describe('ShareThumbnails', () => {
  beforeEach(() => {
    revoke.mockClear();
    Object.assign(URL, {
      createObjectURL: vi.fn((f: Blob) => `blob:${f instanceof File ? f.name : ''}`),
      revokeObjectURL: revoke,
    });
  });

  afterEach(() => {
    cleanup();
  });

  const files = [
    new File(['x'], 'a.png', { type: 'image/png' }),
    new File(['y'], 'b.jpg', { type: 'image/jpeg' }),
  ];

  it('renders nothing when there are no files', () => {
    const { container } = render(<ShareThumbnails files={[]} onRemove={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a labelled list with a blob-backed image per file', () => {
    render(<ShareThumbnails files={files} onRemove={vi.fn()} />);
    expect(screen.getByRole('list', { name: 'Images' })).toBeInTheDocument();
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'blob:a.png');
  });

  it('calls onRemove with the index of the removed file', () => {
    const onRemove = vi.fn();
    render(<ShareThumbnails files={files} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.png' }));
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it('revokes each blob URL on unmount', () => {
    const { unmount } = render(<ShareThumbnails files={files} onRemove={vi.fn()} />);
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:a.png');
    expect(revoke).toHaveBeenCalledWith('blob:b.jpg');
  });
});
