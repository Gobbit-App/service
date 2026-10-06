import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextCard } from './TextCard';

describe('TextCard', () => {
  it('renders bold text as strong element', () => {
    render(<TextCard body="**bold**" />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });

  it('opens links in new tab with security attributes', () => {
    render(<TextCard body="[link](https://example.com)" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render script elements', () => {
    const { container } = render(<TextCard body="<script>alert(1)</script>" />);
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('alert(1)');
  });

  it('renders Hebrew paragraph with dir auto', () => {
    const { container } = render(<TextCard body="שלום עולם" />);
    const paragraph = container.querySelector('p[dir="auto"]');
    expect(paragraph).toBeInTheDocument();
    expect(paragraph).toHaveTextContent('שלום עולם');
  });

  it('renders list items with dir auto', () => {
    render(<TextCard body="- item 1\n- item 2" />);
    const listItems = screen.getAllByRole('listitem');
    listItems.forEach((item) => {
      expect(item).toHaveAttribute('dir', 'auto');
    });
  });
});
