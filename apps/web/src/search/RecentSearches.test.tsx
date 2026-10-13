import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecentSearches } from './RecentSearches';

afterEach(() => {
  cleanup();
});

describe('RecentSearches', () => {
  it('renders nothing when the list is empty', () => {
    const { container } = render(<RecentSearches items={[]} onPick={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('region', { name: 'Recent searches' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent searches' })).not.toBeInTheDocument();
  });

  it('renders one button per item under the Recent searches heading', () => {
    const items = ['oak', 'birthday', '42'];
    render(<RecentSearches items={items} onPick={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Recent searches' })).toBeInTheDocument();

    const list = screen.getByRole('list');
    const buttons = within(list).getAllByRole('button');
    expect(buttons).toHaveLength(items.length);
    expect(buttons.map((b) => b.textContent)).toEqual(items);
    for (const button of buttons) {
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveClass('recent-searches__item');
    }
  });

  it('calls onPick with the clicked query', () => {
    const onPick = vi.fn();
    render(<RecentSearches items={['oak', 'birthday']} onPick={onPick} />);

    fireEvent.click(screen.getByRole('button', { name: 'birthday' }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('birthday');
  });
});
