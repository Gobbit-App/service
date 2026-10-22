import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImageCard } from './ImageCard';
import type { ImagePayload } from './payload-guards';

describe('ImageCard', () => {
  const payload: ImagePayload = {
    publicId: 'test-image',
    alt: 'Test image alt text',
  };

  it('renders Image unavailable when cloudName is null', () => {
    render(<ImageCard payload={payload} cloudName={null} />);
    expect(screen.getByText('Image unavailable')).toBeInTheDocument();
  });

  it('renders img with correct alt', () => {
    render(<ImageCard payload={payload} cloudName="demo" />);
    expect(screen.getByAltText('Test image alt text')).toBeInTheDocument();
  });

  it('renders img with src containing w_720 and cloud name', () => {
    render(<ImageCard payload={payload} cloudName="demo" />);
    const img = screen.getByAltText('Test image alt text') as HTMLImageElement;
    expect(img.src).toContain('w_720');
    expect(img.src).toContain('demo');
  });

  it('renders img with srcset containing 360w, 720w, 1080w', () => {
    render(<ImageCard payload={payload} cloudName="demo" />);
    const img = screen.getByAltText('Test image alt text') as HTMLImageElement;
    const srcset = img.getAttribute('srcset')!;
    expect(srcset).toContain('360w');
    expect(srcset).toContain('720w');
    expect(srcset).toContain('1080w');
  });

  it('reserves the box from the payload dimensions (D161)', () => {
    render(<ImageCard payload={{ ...payload, width: 1200, height: 800 }} cloudName="demo" />);
    const img = screen.getByAltText('Test image alt text');
    expect(img).toHaveAttribute('width', '1200');
    expect(img).toHaveAttribute('height', '800');
  });

  it('still renders a payload saved before 012 (no dimensions)', () => {
    const { container } = render(<ImageCard payload={payload} cloudName="demo" />);
    expect(screen.getByAltText('Test image alt text')).not.toHaveAttribute('width');
    expect(container.querySelector('.cloud-image--unknown')).not.toBeNull();
  });

  it('shows Image unavailable when img errors', () => {
    render(<ImageCard payload={payload} cloudName="demo" />);
    const img = screen.getByAltText('Test image alt text') as HTMLImageElement;
    fireEvent.error(img);
    expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    expect(screen.queryByAltText('Test image alt text')).not.toBeInTheDocument();
  });

  it('loads lazily by default', () => {
    render(<ImageCard payload={payload} cloudName="demo" />);
    const img = screen.getByAltText('Test image alt text');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).not.toHaveAttribute('fetchpriority');
  });

  it('loads a priority image eagerly with high fetch priority', () => {
    render(<ImageCard payload={payload} cloudName="demo" priority />);
    const img = screen.getByAltText('Test image alt text');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });
});
