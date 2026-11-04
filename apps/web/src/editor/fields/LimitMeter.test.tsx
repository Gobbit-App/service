import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { shouldShowCount } from './limit-meter';
import { LimitMeter } from './LimitMeter';

describe('shouldShowCount (D307)', () => {
  it.each([
    [0, 100, false],
    [79, 100, false],
    [80, 100, true],
    [100, 100, true],
    [101, 100, true],
    [0, 0, true],
  ])('%i of %i → %s', (used, max, shown) => {
    expect(shouldShowCount(used, max)).toBe(shown);
  });
});

describe('LimitMeter', () => {
  it('stays empty below 80 % so the canvas carries no numbers', () => {
    render(<LimitMeter id="m" used={10} max={600} />);
    const meter = document.getElementById('m');
    expect(meter).toBeEmptyDOMElement();
    expect(meter).not.toHaveAttribute('aria-live');
  });

  it('shows the count from 80 %, quietly until 90 %', () => {
    render(<LimitMeter id="m" used={480} max={600} />);
    expect(screen.getByText('480 / 600 characters')).not.toHaveAttribute('aria-live');
  });

  it('announces near the limit and marks going over', () => {
    const { rerender } = render(<LimitMeter used={550} max={600} />);
    expect(screen.getByText('550 / 600 characters')).toHaveAttribute('aria-live', 'polite');
    rerender(<LimitMeter used={601} max={600} unit="bytes" />);
    expect(screen.getByText('601 / 600 bytes')).toHaveClass('limit-meter--over');
  });
});
