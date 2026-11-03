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

  it('renders single newlines as line breaks (D283)', () => {
    const { container } = render(<TextCard body={'Milk\nEggs\nBread'} />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.querySelectorAll('br')).toHaveLength(2);
  });

  it('keeps blank lines as separate paragraphs', () => {
    const { container } = render(<TextCard body={'One\n\nTwo'} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelector('br')).not.toBeInTheDocument();
  });

  it('renders underline, size and colour styles', () => {
    const { container } = render(
      <TextCard body=":u[under] :small[tiny] :large[big] :color[hot]{.red}" />,
    );
    expect(screen.getByText('under').tagName).toBe('U');
    expect(screen.getByText('tiny')).toHaveClass('rt-small');
    expect(screen.getByText('big')).toHaveClass('rt-large');
    expect(screen.getByText('hot')).toHaveClass('rt-color', 'rt-color--red');
    expect(container.textContent).not.toContain(':');
  });

  it('shows unknown directives as plain text', () => {
    const { container } = render(<TextCard body="Re:Plan :huge[hot] :color[x]{.pink}" />);
    expect(container.textContent).toBe('Re:Plan hot x');
    expect(container.querySelector('span')).not.toBeInTheDocument();
  });

  it('renders list items with dir auto', () => {
    render(<TextCard body="- item 1\n- item 2" />);
    const listItems = screen.getAllByRole('listitem');
    listItems.forEach((item) => {
      expect(item).toHaveAttribute('dir', 'auto');
    });
  });
});
