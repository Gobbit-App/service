import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeCategory, makeItem } from '../../test/fixtures';
import { DetailsPane, NO_DETAILS_COPY } from './DetailsPane';

const food = makeCategory({ id: 'c-food', slug: 'food', name: 'Food', isDefault: false });
const school = makeCategory({ id: 'c-school', slug: 'school', name: 'School', isDefault: false });

describe('DetailsPane', () => {
  it('lists the extracted details grouped by kind', () => {
    const item = makeItem({
      id: 'i1',
      title: 'Pizza place',
      entities: { phones: ['+1 555 0100'], hours: ['Mon–Fri 9–5'] },
    });
    render(<DetailsPane item={item} categories={[]} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Pizza place' })).toHaveAttribute(
      'id',
      'card-title-i1',
    );
    const details = screen.getByRole('list', { name: 'Extracted details' });
    expect(within(details).getByText('Phone')).toBeInTheDocument();
    expect(within(details).getByText(/\+1 555 0100/)).toBeInTheDocument();
    expect(within(details).getByText('Hours')).toBeInTheDocument();
  });

  it('shows the category names and the type', () => {
    const item = makeItem({ type: 'link', categoryIds: ['c-school', 'c-food', 'c-hidden'] });
    render(<DetailsPane item={item} categories={[food, school]} />);
    expect(screen.getByText('School, Food')).toBeInTheDocument();
    expect(screen.getByText('Link')).toBeInTheDocument();
  });

  it('explains when nothing was extracted', () => {
    render(<DetailsPane item={makeItem({ entities: { phones: [] } })} categories={[]} />);
    expect(screen.getByText(NO_DETAILS_COPY)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Extracted details' })).not.toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
  });
});
