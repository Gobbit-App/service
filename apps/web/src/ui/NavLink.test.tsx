import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NavigateContext, NavLink } from './NavLink';

function setup() {
  const navigate = vi.fn();
  render(
    <NavigateContext.Provider value={navigate}>
      <NavLink href="/d/family">Family</NavLink>
    </NavigateContext.Provider>,
  );
  return { navigate, link: screen.getByRole('link', { name: 'Family' }) };
}

describe('NavLink', () => {
  it('navigates in-app on a plain click', () => {
    const { navigate, link } = setup();
    expect(link).toHaveAttribute('href', '/d/family');
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith('/d/family');
  });

  it('leaves modified clicks to the browser', () => {
    const { navigate, link } = setup();
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { ctrlKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });
});
