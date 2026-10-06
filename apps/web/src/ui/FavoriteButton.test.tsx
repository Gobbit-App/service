import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FavoriteButton } from './FavoriteButton';

describe('FavoriteButton', () => {
  it('renders with aria-pressed=true and correct label when favorite', () => {
    render(<FavoriteButton isFavorite={true} onToggle={() => {}} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('aria-label', 'Remove from favorites');
  });

  it('renders with aria-pressed=false and correct label when not favorite', () => {
    render(<FavoriteButton isFavorite={false} onToggle={() => {}} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('aria-label', 'Add to favorites');
  });

  it('displays filled star when favorite', () => {
    render(<FavoriteButton isFavorite={true} onToggle={() => {}} />);
    expect(screen.getByText('★')).toBeInTheDocument();
  });

  it('displays empty star when not favorite', () => {
    render(<FavoriteButton isFavorite={false} onToggle={() => {}} />);
    expect(screen.getByText('☆')).toBeInTheDocument();
  });

  it('calls onToggle when clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<FavoriteButton isFavorite={false} onToggle={onToggle} />);
    await user.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('does not call onToggle when disabled and clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<FavoriteButton isFavorite={false} onToggle={onToggle} disabled />);
    await user.click(screen.getByRole('button'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
