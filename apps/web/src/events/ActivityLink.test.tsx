import { render, screen } from '@testing-library/react';
import type { MemberRole } from '@gobbit/shared';
import { describe, expect, it } from 'vitest';
import { ActivityLink } from './ActivityLink';

describe('ActivityLink (D188)', () => {
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
