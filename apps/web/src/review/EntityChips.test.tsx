import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { EntityChips } from './EntityChips';

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
});
