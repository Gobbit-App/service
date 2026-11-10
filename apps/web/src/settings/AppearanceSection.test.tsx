import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_KEY } from '../theme/theme';
import { AppearanceSection } from './AppearanceSection';

const option = (name: string) => screen.getByRole('radio', { name });

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => localStorage.clear());

describe('AppearanceSection', () => {
  it('starts on Match device when nothing is stored', () => {
    render(<AppearanceSection />);
    expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy();
    expect((option('Match device') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Saved on this device.')).toBeTruthy();
  });

  it('shows the stored choice', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    render(<AppearanceSection />);
    expect((option('Dark') as HTMLInputElement).checked).toBe(true);
  });

  it('falls back to Match device for an unknown stored value', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    render(<AppearanceSection />);
    expect((option('Match device') as HTMLInputElement).checked).toBe(true);
  });

  it('applies and saves a choice at once, and forgets it for Match device', () => {
    render(<AppearanceSection />);

    fireEvent.click(option('Light'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');

    fireEvent.click(option('Match device'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });
});
