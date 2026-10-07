import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChipRow } from './ChipRow';
import { makeCategory } from '../test/fixtures';

describe('ChipRow', () => {
  it('renders chips in correct order: All, Favorites, categories by position, Archived', () => {
    const categories = [
      makeCategory({ name: 'General', position: 0, isDefault: true }),
      makeCategory({ name: 'Science', slug: 'science', position: 2, isDefault: false }),
      makeCategory({ name: 'History', slug: 'history', position: 1, isDefault: false }),
    ];

    render(
      <ChipRow
        deckSlug="family"
        categories={categories}
        active={{ kind: 'all' }}
        showArchived={true}
        onNavigate={vi.fn()}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent('All');
    expect(links[1]).toHaveTextContent('Favorites');
    expect(links[2]).toHaveTextContent('General');
    expect(links[3]).toHaveTextContent('History');
    expect(links[4]).toHaveTextContent('Science');
    expect(links[5]).toHaveTextContent('Archived');
  });

  it('does not render Archived chip when showArchived is false', () => {
    const categories = [makeCategory({ name: 'General', position: 0, isDefault: true })];

    render(
      <ChipRow
        deckSlug="family"
        categories={categories}
        active={{ kind: 'all' }}
        showArchived={false}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.queryByText('Archived')).not.toBeInTheDocument();
  });

  it('marks active chip with aria-current="page"', () => {
    const categories = [makeCategory({ name: 'School', slug: 'school', position: 0 })];

    render(
      <ChipRow
        deckSlug="family"
        categories={categories}
        active={{ kind: 'category', slug: 'school' }}
        showArchived={true}
        onNavigate={vi.fn()}
      />,
    );

    const schoolLink = screen.getByText('School');
    expect(schoolLink).toHaveAttribute('aria-current', 'page');

    const allLink = screen.getByText('All');
    expect(allLink).not.toHaveAttribute('aria-current');
  });

  it('calls onNavigate with href and prevents default on click', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    const categories = [makeCategory({ name: 'School', slug: 'school', position: 0 })];

    render(
      <ChipRow
        deckSlug="family"
        categories={categories}
        active={{ kind: 'all' }}
        showArchived={false}
        onNavigate={onNavigate}
      />,
    );

    const schoolLink = screen.getByText('School');
    await user.click(schoolLink);

    expect(onNavigate).toHaveBeenCalledWith('/d/family/c/school');
  });

  it('does not call onNavigate on ctrl+click', () => {
    const onNavigate = vi.fn();
    const categories = [makeCategory({ name: 'School', slug: 'school', position: 0 })];

    render(
      <ChipRow
        deckSlug="family"
        categories={categories}
        active={{ kind: 'all' }}
        showArchived={false}
        onNavigate={onNavigate}
      />,
    );

    const schoolLink = screen.getByText('School');
    fireEvent.click(schoolLink, { ctrlKey: true });

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('has correct hrefs for Favorites and Archived', () => {
    const categories = [makeCategory({ name: 'General', position: 0, isDefault: true })];

    render(
      <ChipRow
        deckSlug="family"
        categories={categories}
        active={{ kind: 'all' }}
        showArchived={true}
        onNavigate={vi.fn()}
      />,
    );

    const allLink = screen.getByText('All');
    expect(allLink).toHaveAttribute('href', '/d/family');

    const favoritesLink = screen.getByText('Favorites');
    expect(favoritesLink).toHaveAttribute('href', '/d/family/favorites');

    const archivedLink = screen.getByText('Archived');
    expect(archivedLink).toHaveAttribute('href', '/d/family/archived');
  });
});
