import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EndPage, endTitle } from './EndPage';

const food = { slug: 'food', name: 'Food' };
const school = { slug: 'school', name: 'School' };

describe('endTitle', () => {
  it('names the category, or says every card for All', () => {
    expect(endTitle(food)).toBe("That's all in Food");
    expect(endTitle({ slug: 'all', name: 'All' })).toBe("You've seen every card");
  });
});

describe('EndPage', () => {
  it('continues to the next category or goes back to the list', () => {
    const onCategory = vi.fn();
    const onClose = vi.fn();
    render(
      <EndPage
        current={food}
        nextCategory={school}
        onCategory={onCategory}
        onClose={onClose}
        active
      />,
    );
    expect(screen.getByRole('heading', { name: "That's all in Food" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to School' }));
    expect(onCategory).toHaveBeenCalledWith('school');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('offers only the way back after the last category, and hides while off screen', () => {
    const { container } = render(
      <EndPage
        current={school}
        nextCategory={null}
        onCategory={vi.fn()}
        onClose={vi.fn()}
        active={false}
      />,
    );
    const page = container.querySelector('section');
    expect(page).toHaveAttribute('aria-hidden', 'true');
    expect(page).toHaveAttribute('inert');
    expect(container.textContent).not.toContain('Continue');
  });
});
