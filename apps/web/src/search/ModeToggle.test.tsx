import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModeToggle } from './ModeToggle';

describe('ModeToggle', () => {
  it('marks the current mode as pressed', () => {
    render(<ModeToggle mode="ask" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Ask' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports only a change of mode', () => {
    const onChange = vi.fn();
    render(<ModeToggle mode="search" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ask');
  });
});
