import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as ViewerModule from './PageViewer';
import { GalleryCard } from './GalleryCard';
import { resetMediaModules } from './load-media-module';

const photos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    publicId: `gobbit/items/d/p${i}`,
    width: 40,
    height: 30,
    ...(i === 1 ? { alt: 'Second photo' } : {}),
  }));

beforeEach(() => {
  resetMediaModules({ viewer: async () => ViewerModule });
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
});
afterEach(() => resetMediaModules());

describe('GalleryCard (D398, D399)', () => {
  it('renders one photo exactly as a photo card, with no count or gallery chrome', () => {
    render(
      <GalleryCard title="Bread" payload={{ kind: 'image', images: photos(1) }} cloudName="demo" />,
    );
    expect(screen.queryByText(/photos/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the cover with the count and opens the viewer at photo 1 of N', async () => {
    const { container } = render(
      <GalleryCard title="Play" payload={{ kind: 'image', images: photos(3) }} cloudName="demo" />,
    );
    expect(screen.getByText('3 photos')).toBeInTheDocument();
    expect(container.querySelectorAll('.cloud-image__img')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open 3 photos' }));
    expect(await screen.findByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Second photo')).toBeInTheDocument();
  });

  it('moves with the arrow keys and closes back to the card', async () => {
    render(
      <GalleryCard title="Play" payload={{ kind: 'image', images: photos(3) }} cloudName="demo" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open 3 photos' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
