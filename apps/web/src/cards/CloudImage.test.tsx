import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FakeResizeObserver } from '../test/resize-observer';
import { CloudImage, type CloudImageProps } from './CloudImage';
import { imageSizesFor } from './use-element-width';

const base: CloudImageProps = { cloudName: 'demo', publicId: 'gobbit/items/d/p', alt: 'Bread' };

function renderImage(props: Partial<CloudImageProps> = {}) {
  const view = render(<CloudImage {...base} {...props} />);
  const wrapper = view.container.querySelector('.cloud-image')!;
  const placeholder = () => view.container.querySelector('.cloud-image__placeholder');
  return { ...view, wrapper, placeholder, img: screen.getByAltText(props.alt ?? base.alt) };
}

describe('CloudImage sizing (D161)', () => {
  it('uses the viewport estimate before the wrapper is measured', () => {
    const { img } = renderImage();
    expect(img).toHaveAttribute('sizes', imageSizesFor(window.innerWidth));
  });

  it('switches to the measured wrapper width and keeps the three-width srcset', () => {
    const { img, wrapper } = renderImage();
    act(() => FakeResizeObserver.resize(wrapper, 576.4));
    expect(img).toHaveAttribute('sizes', '576px');
    expect(img.getAttribute('srcset')!.split(', ')).toHaveLength(3);
    expect(img.getAttribute('src')).toContain('c_limit,w_720/gobbit/items/d/p');
  });

  it('loads lazily by default, eagerly with high priority when asked', () => {
    expect(renderImage().img).toHaveAttribute('loading', 'lazy');
    const { img, placeholder } = renderImage({ alt: 'First', priority: true });
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(placeholder()).toHaveAttribute('loading', 'eager');
  });
});

describe('CloudImage box and placeholder (D161)', () => {
  it('sets width/height when the dimensions are known', () => {
    const { img, wrapper } = renderImage({ width: 900, height: 1600 });
    expect(img).toHaveAttribute('width', '900');
    expect(img).toHaveAttribute('height', '1600');
    expect(wrapper).not.toHaveClass('cloud-image--unknown');
  });

  it('falls back to the default box without dimensions', () => {
    const { img, wrapper } = renderImage();
    expect(img).not.toHaveAttribute('width');
    expect(wrapper).toHaveClass('cloud-image--unknown');
  });

  it('shows a decorative blurred placeholder until the sharp image loads', () => {
    const { img, wrapper, placeholder } = renderImage();
    expect(placeholder()).toHaveAttribute('aria-hidden', 'true');
    expect(placeholder()).toHaveAttribute('alt', '');
    expect(placeholder()!.getAttribute('src')).toContain('q_1,e_blur:2000,w_32');
    fireEvent.load(img);
    expect(wrapper).toHaveClass('cloud-image--loaded');
    expect(placeholder()).toBeNull();
  });

  it('drops the placeholder and calls onError when the sharp image fails', () => {
    const onError = vi.fn();
    const { img, wrapper, placeholder } = renderImage({ onError });
    fireEvent.error(img);
    expect(onError).toHaveBeenCalledOnce();
    expect(placeholder()).toBeNull();
    expect(wrapper).not.toHaveClass('cloud-image--loaded');
  });

  it('adds the caller class to the wrapper', () => {
    expect(renderImage({ className: 'link-card__image' }).wrapper).toHaveClass('link-card__image');
  });
});
