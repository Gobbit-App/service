import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { EntityChips, removeEntity } from './EntityChips';

describe('EntityChips', () => {
  it('renders nothing when there are no entities', () => {
    const { container } = render(<EntityChips entities={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders phones before urls, one chip per value, with kind label and value', () => {
    render(<EntityChips entities={{ urls: ['u.example'], phones: ['555'] }} />);
    const list = screen.getByRole('list', { name: 'Extracted details' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/^Phone 555$/);
    expect(items[1]).toHaveTextContent(/^Link u\.example$/);
  });

  it('labels every kind', () => {
    render(
      <EntityChips
        entities={{
          phones: ['1'],
          addresses: ['2'],
          hours: ['3'],
          prices: ['4'],
          dates: ['5'],
          people: ['6'],
          urls: ['7'],
        }}
      />,
    );
    const labels = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(labels).toEqual([
      'Phone 1',
      'Address 2',
      'Hours 3',
      'Price 4',
      'Date 5',
      'Person 6',
      'Link 7',
    ]);
  });

  it('has no remove buttons without onRemove', () => {
    render(<EntityChips entities={{ phones: ['555'] }} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onRemove with the kind and index', () => {
    const onRemove = vi.fn();
    render(<EntityChips entities={{ phones: ['555', '666'] }} onRemove={onRemove} />);
    const remove = screen.getByRole('button', { name: 'Remove Phone 666' });
    expect(remove.querySelector('svg')).not.toBeNull();
    expect(remove).not.toHaveTextContent('×');
    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith('phones', 1);
  });
});

describe('removeEntity', () => {
  it('drops one value and keeps the rest', () => {
    expect(removeEntity({ phones: ['1', '2'], urls: ['u'] }, 'phones', 0)).toEqual({
      phones: ['2'],
      urls: ['u'],
    });
  });
});
