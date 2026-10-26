import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

describe('Icon', () => {
  it('renders a decorative 24 px stroked svg', () => {
    const { container } = render(<Icon name="edit" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke-width')).toBe('1.75');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.classList.contains('icon--directional')).toBe(false);
  });

  it('fills only fillable icons', () => {
    const star = render(<Icon name="star" filled />).container.querySelector('svg')!;
    expect(star.getAttribute('fill')).toBe('currentColor');
    const edit = render(<Icon name="edit" filled />).container.querySelector('svg')!;
    expect(edit.getAttribute('fill')).toBe('none');
  });

  it('marks directional icons so they mirror in RTL', () => {
    const { container } = render(<Icon name="back" />);
    expect(container.querySelector('svg')!.classList.contains('icon--directional')).toBe(true);
  });
});
