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

  describe('D163 stored snapshot', () => {
    const stored: LinkPayload = {
      url: 'https://example.com',
      preview: {
        title: 'T',
        image: 'https://example.com/og.jpg',
        publicId: 'gobbit/links/d1/abc',
        width: 1200,
        height: 630,
      },
    };

    it('renders the stored copy through CloudImage when a cloud name is set', () => {
      const { container } = render(<LinkCard payload={stored} cloudName="demo" />);
      const img = container.querySelector('img.cloud-image__img')!;
      expect(img.getAttribute('src')).toContain('demo');
      expect(img.getAttribute('src')).toContain('gobbit/links/d1/abc');
      expect(container.querySelector('img[src="https://example.com/og.jpg"]')).toBeNull();
    });

    it('falls back to the page image when the stored copy fails, then to none', () => {
      const { container } = render(<LinkCard payload={stored} cloudName="demo" />);
      fireEvent.error(container.querySelector('img.cloud-image__img')!);
      const remote = container.querySelector('img[src="https://example.com/og.jpg"]')!;
      expect(remote).toBeInTheDocument();
      fireEvent.error(remote);
      expect(container.querySelector('img')).toBeNull();
    });

    it('uses the page image without a cloud name', () => {
      const { container } = render(<LinkCard payload={stored} cloudName={null} />);
      expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/og.jpg');
    });
  });

  it('D165: shows the link check flag when given', () => {
    render(
      <LinkCard
        payload={{ url: 'https://example.com' }}
        health={{ status: 'dead', checkedAt: '2026-10-20T06:30:00.000Z' }}
      />,
    );
    expect(screen.getByText('Link may be dead')).toBeInTheDocument();
  });

  describe('locked social hosts (D168)', () => {
    it.each([
      ['https://www.instagram.com/p/abc/', 'Instagram', 'instagram.com'],
      ['https://vm.tiktok.com/abc/', 'TikTok', 'vm.tiktok.com'],
      ['https://x.com/someone/status/1', 'X', 'x.com'],
    ])('labels %s as %s instead of the domain', (url, label, domain) => {
      const { container } = render(<LinkCard payload={{ url, preview: { title: 'Post' } }} />);
      expect(container.querySelector('.link-card__host')).toHaveTextContent(label);
      expect(screen.queryByText(domain)).toBeNull();
    });

    it('keeps the domain line for other hosts, including look-alikes', () => {
      const { container } = render(<LinkCard payload={{ url: 'https://notinstagram.com/p' }} />);
      expect(container.querySelector('.link-card__host')).toBeNull();
      expect(screen.getByText('notinstagram.com')).toBeInTheDocument();
    });
  });
});
