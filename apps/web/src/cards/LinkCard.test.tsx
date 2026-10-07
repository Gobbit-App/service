import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkCard } from './LinkCard';
import type { LinkPayload } from './payload-guards';

describe('LinkCard', () => {
  it('renders full preview with image, title, description, and domain', () => {
    const payload: LinkPayload = {
      url: 'https://www.example.com/a',
      preview: {
        title: 'Example Title',
        description: 'Example Description',
        image: 'https://example.com/image.jpg',
      },
    };

    const { container } = render(<LinkCard payload={payload} />);

    const img = container.querySelector('img')!;
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
    expect(screen.getByText('Example Title')).toBeInTheDocument();
    expect(screen.getByText('Example Description')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('renders domain and url when no preview', () => {
    const payload: LinkPayload = {
      url: 'https://example.com/page',
    };

    const { container } = render(<LinkCard payload={payload} />);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/page')).toBeInTheDocument();
  });

  it('removes image when image fails to load', () => {
    const payload: LinkPayload = {
      url: 'https://example.com',
      preview: {
        image: 'https://example.com/bad.jpg',
      },
    };

    const { container } = render(<LinkCard payload={payload} />);
    const img = container.querySelector('img')!;
    expect(img).toBeInTheDocument();

    fireEvent.error(img);

    expect(container.querySelector('img')).toBeNull();
  });

  it('renders Open link with correct attributes', () => {
    const payload: LinkPayload = {
      url: 'https://example.com',
    };

    render(<LinkCard payload={payload} />);

    const link = screen.getByRole('link', { name: /Open/i });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders with invalid url string', () => {
    const payload: LinkPayload = {
      url: 'not a valid url',
    };

    render(<LinkCard payload={payload} />);

    expect(screen.getByText('not a valid url')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not link to non-web URLs', () => {
    render(<LinkCard payload={{ url: 'javascript:alert(1)' }} />);

    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
