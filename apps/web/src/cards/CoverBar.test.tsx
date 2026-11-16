import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoverBar } from './CoverBar';

const cover = { publicId: 'gobbit/items/d/p', width: 800, height: 450 };

describe('CoverBar (D411)', () => {
  it('renders nothing without a cover', () => {
    expect(render(<CoverBar cover={null} cloudName="demo" />).container).toBeEmptyDOMElement();
    expect(render(<CoverBar cover={undefined} cloudName="demo" />).container).toBeEmptyDOMElement();
  });

  it('renders a decorative 16:9 image with the box reserved', () => {
    const { container } = render(<CoverBar cover={cover} cloudName="demo" />);
    const img = container.querySelector('.cloud-image__img')!;
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('width', '800');
    expect(container.querySelector('.card__cover.link-card__image--stored')).not.toBeNull();
  });

  it('disappears after an error event', () => {
    const { container } = render(<CoverBar cover={cover} cloudName="demo" />);
    fireEvent.error(container.querySelector('.cloud-image__img')!);
    expect(container).toBeEmptyDOMElement();
  });
});
