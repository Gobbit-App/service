import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoverBar } from './CoverBar';

vi.mock('./use-cloud-name', () => ({ useCloudName: () => 'demo' }));

const cover = { publicId: 'gobbit/items/d/cover', width: 1200, height: 300 };

describe('CoverBar (D391)', () => {
  it('renders nothing without a cover', () => {
    expect(render(<CoverBar cover={null} />).container).toBeEmptyDOMElement();
    expect(render(<CoverBar cover={undefined} />).container).toBeEmptyDOMElement();
  });

  it('renders a decorative CloudImage with stored dimensions and the card__cover class', () => {
    const { container } = render(<CoverBar cover={cover} />);
    expect(container.querySelector('.cloud-image.card__cover')).toBeInTheDocument();
    const img = container.querySelector('img.cloud-image__img')!;
    expect(img).toHaveAttribute('alt', '');
    expect(img.getAttribute('src')).toContain('gobbit/items/d/cover');
    expect(img).toHaveAttribute('width', '1200');
    expect(img).toHaveAttribute('height', '300');
  });

  it('renders nothing after the image errors', () => {
    const { container } = render(<CoverBar cover={cover} />);
    fireEvent.error(container.querySelector('img.cloud-image__img')!);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a replacement cover after the previous one failed', () => {
    const { container, rerender } = render(<CoverBar cover={cover} />);
    fireEvent.error(container.querySelector('img.cloud-image__img')!);
    expect(container).toBeEmptyDOMElement();
    rerender(<CoverBar cover={{ ...cover, publicId: 'gobbit/items/d/other' }} />);
    expect(container.querySelector('img.cloud-image__img')?.getAttribute('src')).toContain(
      'gobbit/items/d/other',
    );
  });

  it('forwards the priority hint', () => {
    const { container } = render(<CoverBar cover={cover} image={{ priority: true }} />);
    const img = container.querySelector('img.cloud-image__img')!;
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });
});
