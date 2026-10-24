import { render, screen } from '@testing-library/react';
import type { MemberRole } from '@pb/shared';
import { describe, expect, it } from 'vitest';
import { ActivityLink } from '../events/ActivityLink';
import { ItemHistoryLink } from './ItemHistoryLink';

const ITEM = '550e8400-e29b-41d4-a716-446655440000';

describe('ItemHistoryLink / ActivityLink (D188)', () => {
  it.each<[MemberRole, boolean]>([
    ['owner', true],
    ['maintainer', true],
    ['editor', false],
    ['reader', false],
  ])('%s sees History: %s', (role, shown) => {
    render(<ItemHistoryLink deckSlug="family" itemId={ITEM} role={role} />);
    const link = screen.queryByRole('link', { name: 'History' });
    if (shown) expect(link).toHaveAttribute('href', `/d/family/log?item=${ITEM}`);
    else expect(link).not.toBeInTheDocument();
  });

  it.each<[MemberRole, boolean]>([
    ['owner', true],
    ['maintainer', true],
    ['editor', false],
    ['reader', false],
  ])('%s sees Activity: %s', (role, shown) => {
    render(<ActivityLink deckSlug="family" role={role} />);
    const link = screen.queryByRole('link', { name: 'Activity' });
    if (shown) expect(link).toHaveAttribute('href', '/d/family/log');
    else expect(link).not.toBeInTheDocument();
  });
});
